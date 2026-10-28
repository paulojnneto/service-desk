import { createMiddleware } from "hono/factory";

// The challenge describes a legacy system that is "unavailable for a few seconds" from time to
// time. This middleware reproduces it: every request may wait a little, and some requests start
// an outage window during which every request answers 503.
export type InstabilityConfig = {
  latencyMs: number; // random delay up to this value
  outageRate: number; // chance, from 0 to 1, that a request starts an outage
  outageSeconds: number; // length of each outage
};

export const DEV_INSTABILITY: InstabilityConfig = {
  latencyMs: 600,
  outageRate: 0.02,
  outageSeconds: 3,
};

type Clock = { random: () => number; now: () => number; sleep: (ms: number) => Promise<void> };

const realClock: Clock = {
  random: Math.random,
  now: Date.now,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export function instability(config: InstabilityConfig, clock: Clock = realClock) {
  let outageUntil = 0;

  return createMiddleware(async (c, next) => {
    const now = clock.now();
    if (now >= outageUntil && clock.random() < config.outageRate) {
      outageUntil = now + config.outageSeconds * 1000;
      console.warn(`Simulated legacy outage for ${config.outageSeconds} s`);
    }
    if (now < outageUntil) {
      c.header("retry-after", String(Math.ceil((outageUntil - now) / 1000)));
      return c.json({ error: "unavailable" }, 503);
    }

    if (config.latencyMs > 0) await clock.sleep(clock.random() * config.latencyMs);
    await next();
  });
}

// LEGACY_LATENCY_MS, LEGACY_OUTAGE_RATE and LEGACY_OUTAGE_SECONDS override the development
// defaults; LEGACY_OUTAGE_RATE=0 and LEGACY_LATENCY_MS=0 turn the simulation off.
export function instabilityFromEnv(env = process.env): InstabilityConfig {
  const number = (name: string, fallback: number) => {
    const value = Number(env[name]);
    return env[name] !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback;
  };
  return {
    latencyMs: number("LEGACY_LATENCY_MS", DEV_INSTABILITY.latencyMs),
    outageRate: Math.min(1, number("LEGACY_OUTAGE_RATE", DEV_INSTABILITY.outageRate)),
    outageSeconds: number("LEGACY_OUTAGE_SECONDS", DEV_INSTABILITY.outageSeconds),
  };
}
