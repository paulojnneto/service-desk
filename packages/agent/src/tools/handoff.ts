import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { HANDOFF_TRIGGERS } from "../context";
import { failureOf, servicesFrom } from "./shared";

// The handoff (Annex A, R6; stage 6 PRD, S-06.12): the only write the model can trigger.
// The conversation moves to "waiting for an analyst" and the agent stops replying.
export const transferirParaAnalista = createTool({
  id: "transferir-para-analista",
  description:
    "Transfere a conversa para um analista do service desk. Use quando o funcionário pedir, em casos críticos, quando um chamado estiver vencido e o funcionário quiser, ou quando você continuar sem entender o que ele precisa. Escreva um resumo que o analista entenda sem ler a conversa toda. Depois disso você não responde mais nesta conversa.",
  inputSchema: z.object({
    gatilho: z.enum(HANDOFF_TRIGGERS),
    resumo: z.string().min(10).max(1000),
    numero: z.string().min(3).max(20).optional().describe("O chamado relacionado, se houver"),
  }),
  execute: async ({ gatilho, resumo, numero }, context) => {
    try {
      const handedOff = await servicesFrom(context).handoff({
        trigger: gatilho,
        summary: resumo,
        ...(numero ? { ticketNumber: numero.trim().toUpperCase() } : {}),
      });
      if (!handedOff) {
        return {
          transferido: false,
          permitido: false,
          motivo: "A conversa já está com o service desk.",
        };
      }
      return { transferido: true };
    } catch (error) {
      return failureOf(error);
    }
  },
});
