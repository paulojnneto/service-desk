import { afterEach, describe, expect, it, vi } from "vitest";
import { describeError, logError } from "./log";

class FakeQueryError extends Error {
  constructor(
    public query: string,
    public params: unknown[],
    public override cause: Error,
  ) {
    super(`Failed query: ${query}\nparams: ${params.join(",")}`);
    this.name = "DrizzleQueryError";
  }
}

describe("describeError", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps the cause of a failed query and drops its parameters", () => {
    const error = new FakeQueryError(
      "insert into messages (parts) values ($1)",
      ["Minha senha do SAP é 1234", "ana.souza"],
      new Error('relation "messages" does not exist'),
    );

    const text = describeError(error);

    expect(text).toBe('DrizzleQueryError: relation "messages" does not exist');
    expect(text).not.toContain("ana.souza");
    expect(text).not.toContain("1234");
  });

  it("describes other errors by name and message", () => {
    expect(describeError(new TypeError("boom"))).toBe("TypeError: boom");
    expect(describeError("plain")).toBe("plain");
  });

  it("logs the description, not the error object", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logError("Could not save:", new FakeQueryError("q", ["secret"], new Error("timeout")));
    expect(spy).toHaveBeenCalledWith("Could not save:", "DrizzleQueryError: timeout");
  });
});
