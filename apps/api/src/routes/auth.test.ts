import { describe, expect, it } from "vitest";
import { createApp } from "../app";
import { REMEMBER_TTL_SECONDS, WORKDAY_TTL_SECONDS } from "../session";

const app = createApp();

function post(path: string, body: unknown, cookie?: string) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

async function signIn(email: string, remember = false) {
  const res = await post("/api/auth/sign-in", { email, password: "anything", remember });
  const setCookie = res.headers.get("set-cookie") ?? "";
  return { res, setCookie, cookie: setCookie.split(";")[0] ?? "" };
}

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

  it("lasts a workday by default and 30 days with keep me signed in", async () => {
    const workday = await signIn("ana.souza@nexo.com.br", false);
    const remember = await signIn("ana.souza@nexo.com.br", true);

    expect(workday.setCookie).toContain(`Max-Age=${WORKDAY_TTL_SECONDS}`);
    expect(remember.setCookie).toContain(`Max-Age=${REMEMBER_TTL_SECONDS}`);
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
    const res = await app.request("/api/auth/me", { headers: { cookie } });

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
      const res = await app.request("/api/auth/me", { headers: { cookie: value } });
      expect(res.status).toBe(401);
    }
  });
});

describe("sign-out", () => {
  it("clears the cookie", async () => {
    const { cookie } = await signIn("ana.souza@nexo.com.br");
    const res = await post("/api/auth/sign-out", {}, cookie);

    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie")).toMatch(/nexo_session=;.*Max-Age=0/i);
  });
});
