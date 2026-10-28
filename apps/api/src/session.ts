import type { Role } from "@nexo/shared";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { sealData, unsealData } from "iron-session";

// Session in a cookie sealed by iron-session: encrypted and signed, so browser
// code can neither read nor forge it. It holds only the person's id and role.
export type SessionData = { userId: string; role: Role };

export const SESSION_COOKIE = "nexo_session";
export const REMEMBER_TTL_SECONDS = 30 * 24 * 60 * 60;
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

export async function readSession(c: Context): Promise<SessionData | null> {
  const seal = getCookie(c, SESSION_COOKIE);
  if (!seal) return null;
  try {
    // Expired or tampered seals come back as an empty object.
    const data = await unsealData<Partial<SessionData>>(seal, {
      password: sessionSecret(),
      ttl: REMEMBER_TTL_SECONDS,
    });
    return data.userId && data.role ? { userId: data.userId, role: data.role } : null;
  } catch {
    // Malformed cookie values are treated as no session.
    return null;
  }
}

export async function startSession(c: Context, data: SessionData, remember: boolean) {
  const ttl = remember ? REMEMBER_TTL_SECONDS : WORKDAY_TTL_SECONDS;
  const seal = await sealData(data, { password: sessionSecret(), ttl });
  setCookie(c, SESSION_COOKIE, seal, {
    httpOnly: true,
    sameSite: "Lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ttl,
  });
}

export function endSession(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}
