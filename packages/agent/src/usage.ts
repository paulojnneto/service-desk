// The model usage of each agent turn (stage 10 PRD, S-10.10). The agent reports it when a
// turn finishes; the evals add it up per scenario, and Stage 11 can estimate costs from it.
// The app registers no listener, so nothing changes for it.

export type AgentUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  // Model calls in the turn: one per step.
  steps: number;
};

type Listener = (usage: AgentUsage) => void;

const listeners = new Set<Listener>();

// Returns a function that stops listening.
export function onAgentUsage(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function reportUsage(usage: AgentUsage) {
  for (const listener of listeners) listener(usage);
}

// From the AI SDK's usage, where any count may be missing.
export function usageOf(
  total: {
    inputTokens?: number;
    outputTokens?: number;
    inputTokenDetails?: { cacheReadTokens?: number };
  },
  steps: number,
): AgentUsage {
  return {
    inputTokens: total.inputTokens ?? 0,
    cachedInputTokens: total.inputTokenDetails?.cacheReadTokens ?? 0,
    outputTokens: total.outputTokens ?? 0,
    steps,
  };
}
