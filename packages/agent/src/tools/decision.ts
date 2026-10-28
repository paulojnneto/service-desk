import { createTool } from "@mastra/core/tools";
import { Confidence, Intent } from "@nexo/shared";
import { z } from "zod";

export const RULE_IDS = ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9"] as const;

// The model's part of the decision record (stage 6 PRD, S-06.13). The action and the tools
// are not asked for: the API derives them from the tools that actually ran (S-06.14).
export const registrarDecisao = createTool({
  id: "registrar-decisao",
  description:
    "Registra a sua decisão neste turno. Chame exatamente uma vez por resposta, antes do texto final. Confiança: alta quando o pedido está claro e você tem os dados; media quando precisou supor algo; baixa quando não entendeu o que o funcionário precisa.",
  inputSchema: z.object({
    intencao: Intent,
    confianca: Confidence,
    justificativa: z.string().min(5).max(400).describe("Uma ou duas frases, em português"),
    regras: z.array(z.enum(RULE_IDS)).max(9).describe("Regras do Anexo A aplicadas"),
  }),
  execute: async () => ({ registrado: true }),
});
