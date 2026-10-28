import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { createTestDb } from "./db/test-db";
import { testKeys } from "./test-tokens";

describe("ticket service", () => {
  it("answers the health check without a token", async () => {
    const app = createApp({
      db: await createTestDb(),
      tokenPublicKey: (await testKeys()).publicKey,
    });
    const res = await app.request("/health");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
