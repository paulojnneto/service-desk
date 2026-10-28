import { createTool } from "@mastra/core/tools";
import { Confidence, Intent, RuleId } from "@nexo/shared";
import { z } from "zod";

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
    regras: z.array(RuleId).max(9).describe("Regras do Anexo A aplicadas"),
  }),
  execute: async () => ({ registrado: true }),
});
