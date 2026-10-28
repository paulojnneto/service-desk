import { Hono } from "hono";
import { SignJWT, UnsecuredJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import type { TicketsEnv } from "../env-types";
import { signTestToken, testKeys } from "../test-tokens";
import { serviceToken } from "./service-token";

let keys: Awaited<ReturnType<typeof testKeys>>;
let otherKeys: Awaited<ReturnType<typeof testKeys>>;
let app: Hono<TicketsEnv>;

beforeAll(async () => {
  keys = await testKeys();
  otherKeys = await testKeys();
  app = new Hono<TicketsEnv>();
  app.use(serviceToken(keys.publicKey));
  app.get("/me", (c) => c.json({ requesterId: c.get("requesterId") }));
});

function call(token?: string, headers: Record<string, string> = {}) {
  return app.request("/me", {
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
  });
}

describe("service token", () => {
  it("accepts a valid token and takes the requester from it", async () => {
    const res = await call(await signTestToken(keys.privateKey, "ana.souza"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ requesterId: "ana.souza" });
  });

  it("ignores a requester sent in a header", async () => {
    const token = await signTestToken(keys.privateKey, "ana.souza");
    const res = await call(token, { "x-requester-id": "carla.mendes" });

    expect(await res.json()).toEqual({ requesterId: "ana.souza" });
  });

  it.each([
    ["missing", async () => undefined],
    ["malformed", async () => "not-a-jwt"],
    ["signed by another key", async () => signTestToken(otherKeys.privateKey, "ana.souza")],
    ["expired", async () => signTestToken(keys.privateKey, "ana.souza", { issuedSecondsAgo: 120 })],
    [
      "from another issuer",
      async () => signTestToken(keys.privateKey, "ana.souza", { issuer: "x" }),
    ],
    [
      "for another audience",
      async () => signTestToken(keys.privateKey, "ana.souza", { audience: "x" }),
    ],
    [
      "valid for too long",
      async () => signTestToken(keys.privateKey, "ana.souza", { lifetimeSeconds: 3600 }),
    ],
    ["without jti", async () => signTestToken(keys.privateKey, "ana.souza", { jti: null })],
    [
      "unsigned (alg none)",
      async () =>
        new UnsecuredJWT({ sub: "ana.souza" })
          .setIssuer("nexo-api")
          .setAudience("nexo-tickets")
          .setIssuedAt()
          .setExpirationTime("30s")
          .encode(),
    ],
    [
      "signed with HS256",
      async () =>
        new SignJWT({})
          .setProtectedHeader({ alg: "HS256" })
          .setSubject("ana.souza")
          .setIssuer("nexo-api")
          .setAudience("nexo-tickets")
          .setIssuedAt()
          .setExpirationTime("30s")
          .setJti("x")
          .sign(new TextEncoder().encode("a-shared-secret-of-at-least-32-bytes!")),
    ],
  ])("refuses a token that is %s", async (_case, makeToken) => {
    const res = await call(await makeToken());

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_token" });
  });

  it("refuses a requester who is not in the directory", async () => {
    const res = await call(await signTestToken(keys.privateKey, "nobody"));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unknown_requester" });
  });
});
