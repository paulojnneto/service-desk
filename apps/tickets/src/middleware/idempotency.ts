import { and, eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { idempotencyKeys } from "../db/schema";
import type { TicketsEnv } from "../env-types";

// Every write needs an Idempotency-Key. The first response for each requester and key is
// stored and replayed on repeats, so a client retrying after a timeout never acts twice.
export const idempotency = createMiddleware<TicketsEnv>(async (c, next) => {
  if (c.req.method !== "POST") return next();

  const key = c.req.header("idempotency-key");
  if (!key || key.length > 200) return c.json({ error: "missing_idempotency_key" }, 400);

  const db = c.get("db");
  const requesterId = c.get("requesterId");
  const [stored] = await db
    .select()
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.requesterId, requesterId), eq(idempotencyKeys.key, key)));
  if (stored) {
    c.header("idempotent-replay", "true");
    return c.json(stored.body as object, stored.status as 200);
  }

  await next();

  // Server errors are not stored: the request did not complete and may be retried.
  if (c.res.status >= 500) return;
  const body = await c.res.clone().json();
  await db
    .insert(idempotencyKeys)
    .values({ requesterId, key, status: c.res.status, body })
    .onConflictDoNothing();
});
