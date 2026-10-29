import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp } from "./test-app";

describe("agent API", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>["app"];
  beforeEach(async () => {
    ({ app } = await createTestApp());
  });

  it("answers the health check", async () => {
    const res = await app.request("/health");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("sends the security headers and the content security policy on every response", async () => {
    for (const res of [await app.request("/health"), await app.request("/api/auth/me")]) {
      const policy = res.headers.get("content-security-policy") ?? "";
      expect(policy).toContain("default-src 'self'");
      expect(policy).toContain("frame-ancestors 'none'");
      expect(policy).toContain("object-src 'none'");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
      expect(res.headers.get("referrer-policy")).toBe("no-referrer");
      expect(res.headers.get("strict-transport-security")).toContain("max-age=");
    }
  });

  it("rejects POST requests that are not JSON (CSRF rule)", async () => {
    const res = await app.request("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "messages=x",
    });

    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ error: "unsupported_media_type" });
  });
});
