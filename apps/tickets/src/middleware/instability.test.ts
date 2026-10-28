import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { instability, instabilityFromEnv } from "./instability";

// A fake clock: time only moves when the test says so, and "random" values come from a list.
function fakeClock(randoms: number[]) {
  let time = 0;
  const slept: number[] = [];
  return {
    clock: {
      random: () => randoms.shift() ?? 0.99,
      now: () => time,
      sleep: async (ms: number) => {
        slept.push(ms);
      },
    },
    advance: (ms: number) => {
      time += ms;
    },
    slept,
  };
}

function appWith(clock: ReturnType<typeof fakeClock>["clock"], outageRate = 0.02) {
  const app = new Hono();
  app.use(instability({ latencyMs: 600, outageRate, outageSeconds: 3 }, clock));
  app.get("/", (c) => c.json({ ok: true }));
  return app;
}

describe("simulated legacy instability", () => {
  it("adds a random delay up to the configured latency", async () => {
    const fake = fakeClock([0.99, 0.5]);
    const res = await appWith(fake.clock).request("/");

    expect(res.status).toBe(200);
    expect(fake.slept).toEqual([300]);
  });

  it("answers 503 for the whole outage window, then recovers", async () => {
    // First request draws 0.01 (< 2%): an outage starts.
    const fake = fakeClock([0.01]);
    const app = appWith(fake.clock);

    const first = await app.request("/");
    fake.advance(2_000);
    const during = await app.request("/");
    fake.advance(1_500);
    const after = await app.request("/");

    expect(first.status).toBe(503);
    expect(await first.json()).toEqual({ error: "unavailable" });
    expect(first.headers.get("retry-after")).toBe("3");
    expect(during.status).toBe(503);
    expect(after.status).toBe(200);
  });

  it("never fails when the outage rate is zero", async () => {
    const fake = fakeClock([0, 0, 0]);
    const app = appWith(fake.clock, 0);

    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await app.request("/")).status);
    expect(statuses).toEqual([200, 200, 200]);
  });
});

describe("instabilityFromEnv", () => {
  it("uses the development defaults", () => {
    expect(instabilityFromEnv({})).toEqual({ latencyMs: 600, outageRate: 0.02, outageSeconds: 3 });
  });

  it("reads the overrides and ignores invalid values", () => {
    expect(
      instabilityFromEnv({
        LEGACY_LATENCY_MS: "0",
        LEGACY_OUTAGE_RATE: "abc",
        LEGACY_OUTAGE_SECONDS: "5",
      }),
    ).toEqual({ latencyMs: 0, outageRate: 0.02, outageSeconds: 5 });
  });
});
