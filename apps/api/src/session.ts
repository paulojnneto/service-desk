import { createHash, randomBytes } from "node:crypto";
import type { Role } from "@nexo/shared";
import { and, eq, gt, lte } from "drizzle-orm";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { sealData, unsealData } from "iron-session";
import type { AppEnv } from "./auth";
import { sessions } from "./db/schema";

// Sign-in sessions stored in the database (stage 5 PRD, S-05.16 and S-05.17). The cookie,
// sealed by iron-session, holds only a random session id; the table keeps its SHA-256 with
// the person, the role and the expiry. Signing out deletes the row, so a copy of the cookie
// stops working at once.
export type SessionData = { userId: string; role: Role };

export const SESSION_COOKIE = "nexo_session";
export const REMEMBER_TTL_SECONDS = 7 * 24 * 60 * 60;
export const WORKDAY_TTL_SECONDS = 10 * 60 * 60;

// Only for local development; production refuses to start without SESSION_SECRET.
const DEV_SECRET = "dev-only-secret-for-nexo-assist-never-use-in-production";

export function sessionSecret(env = process.env): string {
  const secret = env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set with at least 32 characters in production.");
  }
  return DEV_SECRET;
}

// Database errors are not caught here: the middleware answers 503 instead of signing out.
export async function readSession(c: Context<AppEnv>): Promise<SessionData | null> {
  const sid = await readSessionId(c);
  if (!sid) return null;
  const [row] = await c
    .get("db")
    .select({ userId: sessions.personId, role: sessions.role })
    .from(sessions)
    .where(and(eq(sessions.idHash, hash(sid)), gt(sessions.expiresAt, c.get("now")())));
  return row ? { userId: row.userId, role: row.role as Role } : null;
}

export async function startSession(c: Context<AppEnv>, data: SessionData, remember: boolean) {
  const db = c.get("db");
  const now = c.get("now")();
  const ttl = remember ? REMEMBER_TTL_SECONDS : WORKDAY_TTL_SECONDS;
  const sid = randomBytes(32).toString("base64url");

  // Expired rows are removed here, so no cleanup job is needed.
  await db.delete(sessions).where(lte(sessions.expiresAt, now));
  await db.insert(sessions).values({
    idHash: hash(sid),
    personId: data.userId,
    role: data.role,
    createdAt: now,
    expiresAt: new Date(now.getTime() + ttl * 1000),
  });

  const seal = await sealData({ sid }, { password: sessionSecret(), ttl });
  setCookie(c, SESSION_COOKIE, seal, {
    httpOnly: true,
    sameSite: "Lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ttl,
  });
}

export async function endSession(c: Context<AppEnv>) {
  const sid = await readSessionId(c);
  const db = c.get("db");
  if (sid) await db.delete(sessions).where(eq(sessions.idHash, hash(sid)));
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

async function readSessionId(c: Context<AppEnv>): Promise<string | null> {
  const seal = getCookie(c, SESSION_COOKIE);
  if (!seal) return null;
  try {
    // Expired or tampered seals come back as an empty object; cookies from before
    // Stage 5 have no sid and count as signed out.
    const data = await unsealData<{ sid?: string }>(seal, {
      password: sessionSecret(),
      ttl: REMEMBER_TTL_SECONDS,
    });
    return typeof data.sid === "string" ? data.sid : null;
  } catch {
    // Malformed cookie values are treated as no session.
    return null;
  }
}

function hash(sid: string) {
  return createHash("sha256").update(sid).digest("hex");
}
