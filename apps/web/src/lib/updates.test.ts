import type { StoredMessage } from "@nexo/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { highestSeq, mergeUpdates, startPolling } from "./updates";

const stored = (id: string, seq: number): StoredMessage => ({
  id,
  role: "assistant",
  parts: [{ type: "text", text: id }],
  metadata: { author: "analyst", createdAt: "2026-10-29T10:00:00Z", seq },
});

describe("highestSeq", () => {
  it("is the highest stored seq, ignoring messages without one", () => {
    expect(highestSeq([stored("a", 3), { id: "local" }, stored("b", 7)])).toBe(7);
    expect(highestSeq([])).toBe(0);
  });
});

describe("mergeUpdates", () => {
  it("appends new messages in stored order and never twice", () => {
    const screen = [stored("a", 1), { id: "local", metadata: {} }] as StoredMessage[];

    const merged = mergeUpdates(screen, [stored("c", 5), stored("b", 4), stored("a", 1)]);

    expect(merged.map((m) => m.id)).toEqual(["a", "local", "b", "c"]);
    expect(mergeUpdates(merged, [stored("c", 5)]).map((m) => m.id)).toEqual(
      merged.map((m) => m.id),
    );
  });
});

describe("startPolling", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("polls on every interval while active, and stops", async () => {
    const poll = vi.fn(async () => undefined);
    let active = true;
    const stop = startPolling({ poll, intervalMs: 3000, active: () => active });

    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(3000);
    expect(poll).toHaveBeenCalledTimes(2);

    active = false;
    await vi.advanceTimersByTimeAsync(9000);
    expect(poll).toHaveBeenCalledTimes(2);

    active = true;
    stop();
    await vi.advanceTimersByTimeAsync(9000);
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it("keeps polling after a failed poll", async () => {
    const poll = vi.fn(async () => {
      throw new Error("offline");
    });
    const stop = startPolling({ poll, intervalMs: 3000, active: () => true });

    await vi.advanceTimersByTimeAsync(6000);
    expect(poll).toHaveBeenCalledTimes(2);
    stop();
  });
});
