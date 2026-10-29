import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

// A light per-address limit on sign-in and chat (stage 11 PRD, decision 10): enough to stop a
// script, since sign-in takes any password by the challenge's rules. Kept in memory, a fixed
// window per address; the daily limits in the database are what protect the money.

export type RateLimits = { signInPerMinute: number; chatPerMinute: number };

export const DEFAULT_RATE_LIMITS: RateLimits = { signInPerMinute: 10, chatPerMinute: 30 };

const WINDOW_MS = 60_000;

export function createRateLimiter(options: { max: number; windowMs?: number; now?: () => number }) {
  const windowMs = options.windowMs ?? WINDOW_MS;
  const now = options.now ?? Date.now;
  const windows = new Map<string, { start: number; count: number }>();
  return {
    // true when this hit is allowed.
    hit(key: string): boolean {
      const at = now();
      const current = windows.get(key);
      if (!current || at - current.start >= windowMs) {
        // Old windows go away as they are replaced, so the map stays small.
        if (windows.size > 10_000) windows.clear();
        windows.set(key, { start: at, count: 1 });
        return true;
      }
      current.count += 1;
      return current.count <= options.max;
    },
  };
}

// The caller's address: the first x-forwarded-for entry only behind a trusted proxy
// (TRUST_PROXY=1, Stage 12), otherwise the socket's.
export function addressOf(c: Context, trustProxy = process.env.TRUST_PROXY === "1"): string {
  if (trustProxy) {
    const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    // app.request() in tests has no socket.
    return "local";
  }
}

export function rateLimit(max: number) {
  const limiter = createRateLimiter({ max });
  return createMiddleware(async (c, next) => {
    if (!limiter.hit(addressOf(c))) return c.json({ error: "too_many_requests" }, 429);
    await next();
  });
}
