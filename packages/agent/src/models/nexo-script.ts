import type { LanguageModelV4Prompt } from "@ai-sdk/provider";
import type { Script } from "./scripted-model";

// Script of the simulated mode. It grows with each stage: every flow from the
// prototype gets a rule here that mimics the decision the LLM would make.
export const nexoScript: Script = (prompt) => {
  const last = prompt.at(-1);

  if (last?.role === "tool") {
    const result = last.content.find((part) => part.type === "tool-result");
    if (result?.toolName === "consultarHorario" && result.output.type === "json") {
      const { diasUteis, horario, plantao } = result.output.value as Record<string, string>;
      return {
        kind: "text",
        text: `O service desk atende de ${diasUteis}, das ${horario}. ${plantao}`,
      };
    }
  }

  const text = lastUserText(prompt).toLowerCase();
  if (/hor[aá]rio|plant[aã]o|funciona/.test(text)) {
    return { kind: "tool", toolName: "consultarHorario", input: {} };
  }

  return {
    kind: "text",
    text: "Estou em modo simulado, sem LLM. Por enquanto sei responder sobre o horário do service desk.",
  };
};

function lastUserText(prompt: LanguageModelV4Prompt): string {
  const user = prompt.findLast((message) => message.role === "user");
  if (!user) return "";
  return user.content.map((part) => (part.type === "text" ? part.text : "")).join(" ");
}
