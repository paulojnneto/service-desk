import { createTool } from "@mastra/core/tools";
import { z } from "zod";

// Sample tool from the hello world: proves the agent -> tool -> UI path.
// The data comes from the sample article in Annex B of the challenge.
export const consultarHorario = createTool({
  id: "consultar-horario-service-desk",
  description:
    "Retorna o horário de atendimento do service desk de TI da Nexo e a regra de plantão.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    diasUteis: z.string(),
    horario: z.string(),
    plantao: z.string(),
  }),
  execute: async () => ({
    diasUteis: "segunda a sexta",
    horario: "8h às 18h",
    plantao: "Chamados críticos têm plantão 24 horas.",
  }),
});
