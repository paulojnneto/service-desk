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
