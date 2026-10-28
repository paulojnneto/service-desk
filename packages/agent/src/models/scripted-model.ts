import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
  LanguageModelV4Text,
  LanguageModelV4ToolCall,
  LanguageModelV4Usage,
} from "@ai-sdk/provider";

// Simulated model for developing and testing without an LLM key.
// Mastra treats it as a real model: tools really run, and only the decision
// (call a tool or answer) comes from a script.

export type ScriptStep =
  | { kind: "tool"; toolName: string; input: Record<string, unknown> }
  | { kind: "text"; text: string };

export type Script = (prompt: LanguageModelV4Prompt) => ScriptStep;

type ScriptedContent = LanguageModelV4Text | LanguageModelV4ToolCall;

const CHUNK_DELAY_MS = 25;

const EMPTY_USAGE: LanguageModelV4Usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};

export function createScriptedModel(script: Script): LanguageModelV4 {
  let callCount = 0;

  function toContent(step: ScriptStep): ScriptedContent {
    callCount += 1;
    return step.kind === "tool"
      ? {
          type: "tool-call",
          toolCallId: `scripted-call-${callCount}`,
          toolName: step.toolName,
          input: JSON.stringify(step.input),
        }
      : { type: "text", text: step.text };
  }

  return {
    specificationVersion: "v4",
    provider: "nexo",
    modelId: "scripted",
    supportedUrls: {},

    async doGenerate(options: LanguageModelV4CallOptions) {
      const content = toContent(script(options.prompt));
      return {
        content: [content],
        finishReason: finishReasonFor(content),
        usage: EMPTY_USAGE,
        warnings: [],
      };
    },

    async doStream(options: LanguageModelV4CallOptions) {
      const parts = toStreamParts(toContent(script(options.prompt)));
      const stream = new ReadableStream<LanguageModelV4StreamPart>({
        async pull(controller) {
          const part = parts.shift();
          if (!part) return controller.close();
          if (part.type === "text-delta") await sleep(CHUNK_DELAY_MS);
          controller.enqueue(part);
        },
      });
      return { stream };
    },
  };
}

function toStreamParts(content: ScriptedContent): LanguageModelV4StreamPart[] {
  const finish: LanguageModelV4StreamPart = {
    type: "finish",
    usage: EMPTY_USAGE,
    finishReason: finishReasonFor(content),
  };
  if (content.type === "tool-call") {
    return [{ type: "stream-start", warnings: [] }, content, finish];
  }

  // Splits the text into words so streaming looks real in the UI.
  const id = "scripted-text";
  const deltas = content.text
    .split(/(?<=\s)/)
    .map((delta): LanguageModelV4StreamPart => ({ type: "text-delta", id, delta }));
  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id },
    ...deltas,
    { type: "text-end", id },
    finish,
  ];
}

function finishReasonFor(content: ScriptedContent) {
  return content.type === "tool-call"
    ? { unified: "tool-calls" as const, raw: undefined }
    : { unified: "stop" as const, raw: undefined };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
