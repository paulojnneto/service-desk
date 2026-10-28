import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { queryRows, type Db } from "../db/connect";
import { REMEMBER_TTL_SECONDS, WORKDAY_TTL_SECONDS } from "../session";
import { createTestApp, postJson, signIn as signInWith } from "../test-app";

let app: Awaited<ReturnType<typeof createTestApp>>["app"];
let db: Db;
let now: Date;

beforeEach(async () => {
  now = new Date("2026-10-28T12:00:00Z");
  ({ app, db } = await createTestApp({ now: () => now }));
});

const post = (path: string, body: unknown, cookie?: string) => postJson(app, path, body, cookie);
const signIn = (email: string, remember = false) => signInWith(app, email, remember);
const me = (cookie: string) => app.request("/api/auth/me", { headers: { cookie } });

describe("sign-in", () => {
  it("accepts a directory email with any password and returns the user", async () => {
    const { res } = await signIn("ana.souza@nexo.com.br");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: {
        id: "ana.souza",
        role: "employee",
        name: "Ana Souza",
        firstName: "Ana",
        email: "ana.souza@nexo.com.br",
        initials: "AS",
      },
    });
  });

  it("ignores case and surrounding spaces in the email", async () => {
    const { res } = await signIn("  ANA.SOUZA@nexo.com.br ");
    expect(res.status).toBe(200);
  });

  it("sets an HTTP-only cookie whose value does not reveal the person", async () => {
    const { setCookie, cookie } = await signIn("ana.souza@nexo.com.br");

    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/^nexo_session=/);
    const value = decodeURIComponent(cookie);
    expect(value).not.toContain("ana.souza");
    expect(value).not.toContain("Ana Souza");
    expect(value).not.toContain("employee");
  });

  it("lasts a workday by default and 7 days with keep me signed in", async () => {
    const workday = await signIn("ana.souza@nexo.com.br", false);
    const remember = await signIn("ana.souza@nexo.com.br", true);

    expect(WORKDAY_TTL_SECONDS).toBe(10 * 60 * 60);
    expect(REMEMBER_TTL_SECONDS).toBe(7 * 24 * 60 * 60);
    expect(workday.setCookie).toContain(`Max-Age=${WORKDAY_TTL_SECONDS}`);
    expect(remember.setCookie).toContain(`Max-Age=${REMEMBER_TTL_SECONDS}`);
  });

  it("stores the session with a hashed id, never the cookie's id", async () => {
    await signIn("ana.souza@nexo.com.br", true);
    const rows = await queryRows<{ id_hash: string; person_id: string; expires_at: Date }>(
      db,
      sql`select id_hash, person_id, expires_at from sessions`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.person_id).toBe("ana.souza");
    expect(rows[0]?.id_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(new Date(rows[0]!.expires_at).getTime()).toBe(
      now.getTime() + REMEMBER_TTL_SECONDS * 1000,
    );
  });

  it("answers 401 unknown_email for an email outside the directory", async () => {
    const { res, setCookie } = await signIn("someone@gmail.com");

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unknown_email" });
    expect(setCookie).toBe("");
  });

  it("answers 400 invalid_input for empty fields", async () => {
    const res = await post("/api/auth/sign-in", { email: " ", password: "" });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_input" });
  });
});

describe("me", () => {
  it("returns the signed-in person", async () => {
    const { cookie } = await signIn("rafael.lima@nexo.com.br");
    const res = await me(cookie);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ user: { id: "rafael.lima", role: "analyst" } });
  });

  it("answers 401 without a cookie", async () => {
    const res = await app.request("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("answers 401 with a tampered or malformed cookie", async () => {
    const { cookie } = await signIn("ana.souza@nexo.com.br");
    const tampered = cookie.slice(0, -4) + "AAAA";

    for (const value of [tampered, "nexo_session=garbage"]) {
      expect((await me(value)).status).toBe(401);
    }
  });

  it("answers 401 once the stored session has expired", async () => {
    const { cookie } = await signIn("ana.souza@nexo.com.br");
    now = new Date(now.getTime() + WORKDAY_TTL_SECONDS * 1000);

    expect((await me(cookie)).status).toBe(401);
  });

  it("answers 401 when the session row is gone, even with a valid seal", async () => {
    const { cookie } = await signIn("ana.souza@nexo.com.br");
    await db.execute(sql`delete from sessions`);

    expect((await me(cookie)).status).toBe(401);
  });
});

describe("sign-out", () => {
  it("clears the cookie", async () => {
    const { cookie } = await signIn("ana.souza@nexo.com.br");
    const res = await post("/api/auth/sign-out", {}, cookie);

    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie")).toMatch(/nexo_session=;.*Max-Age=0/i);
  });

  it("revokes the session: a copy of the old cookie answers 401", async () => {
    const { cookie } = await signIn("ana.souza@nexo.com.br");
    expect((await me(cookie)).status).toBe(200);

    await post("/api/auth/sign-out", {}, cookie);

    expect((await me(cookie)).status).toBe(401);
  });

  it("leaves the person's other sessions alone", async () => {
    const laptop = await signIn("ana.souza@nexo.com.br");
    const phone = await signIn("ana.souza@nexo.com.br");

    await post("/api/auth/sign-out", {}, laptop.cookie);

    expect((await me(phone.cookie)).status).toBe(200);
  });
});

describe("database unavailable", () => {
  it("answers 503 instead of treating the person as signed out", async () => {
    const { cookie } = await signIn("ana.souza@nexo.com.br");
    const broken = await createTestApp({
      db: {
        select: () => {
          throw new Error("connection refused");
        },
      } as unknown as Db,
    });

    const res = await broken.app.request("/api/auth/me", { headers: { cookie } });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
  });
});
