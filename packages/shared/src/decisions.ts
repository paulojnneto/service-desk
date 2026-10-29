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
  "perguntou",
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

// Annex A rules.
export const RuleId = z.enum(["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9"]);
export type RuleId = z.infer<typeof RuleId>;

export const ToolName = z.enum([
  // The agent's tools, except registrarDecisao, which is the record itself.
  "consultarHorario",
  "buscarNaCentral",
  "listarMeusChamados",
  "consultarChamado",
  "prepararChamado",
  "prepararAtualizacao",
  "prepararReabertura",
  "descartarRascunho",
  "transferirParaAnalista",
  "perguntar",
  // What the server does when the employee confirms or cancels a draft.
  "criarChamado",
  "atualizarChamado",
  "reabrirChamado",
  "cancelarRascunho",
]);
export type ToolName = z.infer<typeof ToolName>;

export const DecisionRecord = z.object({
  intent: Intent,
  action: DecisionAction,
  confidence: Confidence,
  rationale: z.string(),
  // Cited by the model in registrarDecisao.
  rules: z.array(RuleId),
  // Guaranteed by the code that ran (stage 8 PRD, S-08.6).
  enforcedRules: z.array(RuleId),
  tools: z.array(
    z.object({
      // A ToolName; a name the catalog does not know is kept as it came.
      name: z.string(),
      outcome: ToolOutcome,
      // One short, safe argument chosen by code, such as the ticket number (S-08.5).
      subject: z.string().optional(),
    }),
  ),
  // "server" for the replies written after Confirm or Cancel (S-08.7).
  source: z.enum(["agent", "server"]),
  // false when the model did not call registrarDecisao (S-08.8).
  registered: z.boolean(),
});
export type DecisionRecord = z.infer<typeof DecisionRecord>;

// The rules each tool guarantees in code (stage 8 tech spec): "always" whatever the outcome,
// otherwise only for that outcome. perguntar with tickets (R7) and an out-of-scope turn with
// no writes (R8) depend on more than the tool, so buildDecisionRecord adds them.
type Enforced = { always?: RuleId[]; ok?: RuleId[]; recusado?: RuleId[] };

export const ENFORCED_RULES: Record<ToolName, Enforced> = {
  consultarHorario: {},
  buscarNaCentral: {},
  listarMeusChamados: { always: ["R7"] },
  consultarChamado: { always: ["R7"], ok: ["R9"] },
  prepararChamado: { ok: ["R3", "R4", "R9"] },
  prepararAtualizacao: { ok: ["R3", "R7"] },
  prepararReabertura: { ok: ["R3", "R5", "R7"], recusado: ["R5", "R7"] },
  descartarRascunho: {},
  transferirParaAnalista: { ok: ["R6"] },
  perguntar: {},
  criarChamado: { always: ["R3", "R4", "R9"] },
  atualizarChamado: { always: ["R3"] },
  reabrirChamado: { always: ["R3", "R5"] },
  cancelarRascunho: { always: ["R3"] },
};

// The rules the given tools enforced, plus any extra ones, once each and in Annex A order.
export function enforcedRulesOf(
  tools: { name: string; outcome: ToolOutcome }[],
  extra: RuleId[] = [],
): RuleId[] {
  const found = new Set<RuleId>(extra);
  for (const tool of tools) {
    const parsed = ToolName.safeParse(tool.name);
    if (!parsed.success) continue;
    const rules = ENFORCED_RULES[parsed.data];
    for (const rule of rules.always ?? []) found.add(rule);
    if (tool.outcome === "ok") for (const rule of rules.ok ?? []) found.add(rule);
    if (tool.outcome === "recusado") for (const rule of rules.recusado ?? []) found.add(rule);
  }
  return RuleId.options.filter((rule) => found.has(rule));
}
