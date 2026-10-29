import { describe, expect, it } from "vitest";
import { modelName, providerKeyName } from "./index";

describe("modelName", () => {
  it("names the simulated model mock", () => {
    expect(modelName("")).toBe("mock");
    expect(modelName("mock")).toBe("mock");
    expect(modelName("openai/gpt-5.5")).toBe("openai/gpt-5.5");
  });
});

describe("providerKeyName", () => {
  it("needs no key for the simulated model", () => {
    expect(providerKeyName("")).toBeNull();
    expect(providerKeyName("mock")).toBeNull();
  });

  it("names the provider's key", () => {
    expect(providerKeyName("openai/gpt-5.5")).toBe("OPENAI_API_KEY");
    expect(providerKeyName("google-vertex/gemini")).toBe("GOOGLE_VERTEX_API_KEY");
  });
});
