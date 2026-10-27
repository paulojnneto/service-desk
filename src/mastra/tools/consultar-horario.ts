import { createTool } from "@mastra/core/tools";
import { z } from "zod";

// Tool falsa do hello world: valida o caminho agent -> tool -> UI.
// Os dados vêm do artigo de exemplo do Anexo B do desafio.
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
