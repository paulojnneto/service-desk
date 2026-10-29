import { describe, expect, it, vi } from "vitest";
import { onAgentUsage, reportUsage, usageOf } from "./usage";

describe("agent usage", () => {
  it("reaches every listener until it stops listening", () => {
    const listener = vi.fn();
    const stop = onAgentUsage(listener);
    const usage = { inputTokens: 1200, cachedInputTokens: 800, outputTokens: 90, steps: 3 };

    reportUsage(usage);
    stop();
    reportUsage(usage);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(usage);
  });

  it("reads the cached tokens where Mastra reports them", () => {
    expect(
      usageOf({ inputTokens: 13_000, cachedInputTokens: 9_000, outputTokens: 300 }, 3),
    ).toEqual({ inputTokens: 13_000, cachedInputTokens: 9_000, outputTokens: 300, steps: 3 });
  });

  it("counts missing numbers as zero, and falls back to the AI SDK's cached field", () => {
    expect(usageOf({ inputTokens: 10, inputTokenDetails: { cacheReadTokens: 4 } }, 2)).toEqual({
      inputTokens: 10,
      cachedInputTokens: 4,
      outputTokens: 0,
      steps: 2,
    });
  });
});
