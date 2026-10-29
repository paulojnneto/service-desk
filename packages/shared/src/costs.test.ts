import { describe, expect, it } from "vitest";
import { estimateCost } from "./costs";

describe("estimateCost", () => {
  it("prices fresh input, cached input and output apart", () => {
    // 4,000 fresh × $5 + 9,000 cached × $0.50 + 300 output × $30, per million.
    const cost = estimateCost("openai/gpt-5.5", {
      inputTokens: 13_000,
      cachedInputTokens: 9_000,
      outputTokens: 300,
    });
    expect(cost).toBeCloseTo(0.0335, 6);
  });

  it("is zero for the simulated model and null for a model without a price", () => {
    const usage = { inputTokens: 1000, cachedInputTokens: 0, outputTokens: 100 };
    expect(estimateCost("mock", usage)).toBe(0);
    expect(estimateCost("anthropic/claude-sonnet-5-5", usage)).toBeNull();
  });

  it("never prices more cached tokens than input tokens", () => {
    const cost = estimateCost("openai/gpt-5.4-mini", {
      inputTokens: 1000,
      cachedInputTokens: 5000,
      outputTokens: 0,
    });
    expect(cost).toBeCloseTo((1000 * 0.075) / 1_000_000, 9);
  });
});
