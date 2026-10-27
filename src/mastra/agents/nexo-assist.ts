import { Agent } from "@mastra/core/agent";
import { consultarHorario } from "../tools/consultar-horario";

export const nexoAssist = new Agent({
  id: "nexo-assist",
  name: "Nexo Assist",
  instructions: `
    Você é o Nexo Assist, assistente do service desk de TI da Nexo.
    Responda sempre em português do Brasil, de forma curta e clara.
    Quando perguntarem sobre horário de atendimento ou plantão, use a tool consultarHorario.
  `,
  model: process.env.NEXO_AGENT_MODEL ?? "anthropic/claude-opus-5-5",
  tools: { consultarHorario },
});
