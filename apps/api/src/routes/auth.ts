import { findPersonByEmail } from "@nexo/shared";
import { Hono } from "hono";
import { z } from "zod";
import { toSessionUser, type AppEnv } from "../auth";
import { endSession, startSession } from "../session";

const SignInBody = z.object({
  email: z.string().trim().min(1),
  password: z.string().min(1),
  remember: z.boolean().default(false),
});

export const authRoutes = new Hono<AppEnv>()
  // Any password works for the sample directory (challenge rule); it is never stored.
  .post("/sign-in", async (c) => {
    const parsed = SignInBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_input" }, 400);

    const person = findPersonByEmail(parsed.data.email);
    if (!person) return c.json({ error: "unknown_email" }, 401);

    await startSession(c, { userId: person.id, role: person.role }, parsed.data.remember);
    return c.json({ user: toSessionUser(person) });
  })
  .post("/sign-out", async (c) => {
    await endSession(c);
    return c.body(null, 204);
  })
  .get("/me", (c) => {
    const person = c.get("person");
    if (!person) return c.json({ error: "unauthenticated" }, 401);
    return c.json({ user: toSessionUser(person) });
  });
