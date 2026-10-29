import { afterEach, describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit";
import { createTestApp, postJson } from "./test-app";

describe("createRateLimiter", () => {
  it("allows max hits per window and key, then again in a new window", () => {
    let now = 0;
    const limiter = createRateLimiter({ max: 2, windowMs: 1000, now: () => now });

    expect([limiter.hit("a"), limiter.hit("a"), limiter.hit("a")]).toEqual([true, true, false]);
    expect(limiter.hit("b")).toBe(true);
    now = 1000;
    expect(limiter.hit("a")).toBe(true);
  });
});

describe("rate limit on sign-in", () => {
  afterEach(() => {
    delete process.env.TRUST_PROXY;
  });

  const signIn = (app: Awaited<ReturnType<typeof createTestApp>>["app"], forwardedFor?: string) =>
    app.request("/api/auth/sign-in", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}),
      },
      body: JSON.stringify({ email: "ana.souza@nexo.com.br", password: "x" }),
    });

  it("answers 429 past the limit for one address", async () => {
    const { app } = await createTestApp({ rateLimits: { signInPerMinute: 2, chatPerMinute: 30 } });

    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await signIn(app)).status);

    expect(statuses).toEqual([200, 200, 429]);
    expect(await (await signIn(app)).json()).toEqual({ error: "too_many_requests" });
  });

  it("tells addresses apart by x-forwarded-for only behind a trusted proxy", async () => {
    const limits = { signInPerMinute: 1, chatPerMinute: 30 };
    const untrusted = await createTestApp({ rateLimits: limits });
    expect((await signIn(untrusted.app, "10.0.0.1")).status).toBe(200);
    // Without TRUST_PROXY the header is ignored: still the same address.
    expect((await signIn(untrusted.app, "10.0.0.2")).status).toBe(429);

    process.env.TRUST_PROXY = "1";
    const trusted = await createTestApp({ rateLimits: limits });
    expect((await signIn(trusted.app, "10.0.0.1")).status).toBe(200);
    expect((await signIn(trusted.app, "10.0.0.2")).status).toBe(200);
    expect((await signIn(trusted.app, "10.0.0.1")).status).toBe(429);
  });

  it("limits the chat too", async () => {
    const { app } = await createTestApp({ rateLimits: { signInPerMinute: 10, chatPerMinute: 1 } });
    const body = { message: { id: "m1", parts: [{ type: "text", text: "" }] } };

    // Even invalid requests count: the limit comes before the route.
    expect((await postJson(app, "/api/chat", body)).status).not.toBe(429);
    expect((await postJson(app, "/api/chat", body)).status).toBe(429);
  });
});
