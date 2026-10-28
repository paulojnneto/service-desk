import { nexoScript } from "./nexo-script";
import { createScriptedModel } from "./scripted-model";

// An empty NEXO_AGENT_MODEL or "mock" selects the simulated model; any other value
// is a Mastra model router ID (for example "anthropic/claude-opus-5-5").
export function resolveModel(modelId = process.env.NEXO_AGENT_MODEL) {
  if (!modelId || modelId === "mock") return createScriptedModel(nexoScript);
  return modelId;
}
