// The estimated cost of a model turn (stage 11 PRD, S-11.1 and decision 3). Prices are US$
// per million tokens, read from each model's page on the provider's documentation on the date
// below; they change, so the date travels with them and the cost is an estimate.

export type ModelPrice = { input: number; cachedInput: number; output: number };

export const PRICES_READ_ON = "2026-10-29";

// https://developers.openai.com/api/docs/models/<model>, standard processing.
export const MODEL_PRICES: Record<string, ModelPrice> = {
  "openai/gpt-5.5": { input: 5, cachedInput: 0.5, output: 30 },
  "openai/gpt-5.4-mini": { input: 0.75, cachedInput: 0.075, output: 4.5 },
};

export type TokenUsage = { inputTokens: number; cachedInputTokens: number; outputTokens: number };

// null when the model has no price here; zero for the simulated model, which costs nothing.
// Cached tokens are part of the input tokens and are priced apart.
export function estimateCost(model: string, usage: TokenUsage): number | null {
  if (!model || model === "mock") return 0;
  const price = MODEL_PRICES[model];
  if (!price) return null;
  const cached = Math.min(usage.cachedInputTokens, usage.inputTokens);
  const fresh = usage.inputTokens - cached;
  return (
    (fresh * price.input + cached * price.cachedInput + usage.outputTokens * price.output) /
    1_000_000
  );
}
