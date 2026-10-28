import { z } from "zod";

// The decision record stored with every agent reply (stage 6 PRD, S-06.13). The model
// gives intent, confidence, rationale and rules; the action and the tools come from what
// actually ran (S-06.14).

export const Intent = z.enum([
  "duvida",
  "status_chamado",
  "adicionar_informacao",
  "abrir_chamado",
  "reabrir_chamado",
  "falar_com_analista",
  "fora_do_escopo",
  "outro",
]);
export type Intent = z.infer<typeof Intent>;

// Three levels with a written meaning (stage 6 PRD, decision 4).
export const Confidence = z.enum(["alta", "media", "baixa"]);
export type Confidence = z.infer<typeof Confidence>;

export const DecisionAction = z.enum([
  // From the agent's tools, in order of importance.
  "transferiu",
  "preparou_rascunho",
  "descartou_rascunho",
  "recusou_reabertura",
  "consultou_chamados",
  "respondeu_central",
  "redirecionou",
  "pediu_esclarecimento",
  "respondeu",
  // Written by the server when the employee confirms or cancels a draft.
  "criou_chamado",
  "atualizou_chamado",
  "reabriu_chamado",
  "cancelou_rascunho",
]);
export type DecisionAction = z.infer<typeof DecisionAction>;

export const ToolOutcome = z.enum(["ok", "nao_encontrado", "indisponivel", "recusado", "erro"]);
export type ToolOutcome = z.infer<typeof ToolOutcome>;

export const DecisionRecord = z.object({
  intent: Intent,
  action: DecisionAction,
  confidence: Confidence,
  rationale: z.string(),
  rules: z.array(z.string()),
  tools: z.array(z.object({ name: z.string(), outcome: ToolOutcome })),
});
export type DecisionRecord = z.infer<typeof DecisionRecord>;
