import {
  Confidence,
  enforcedRulesOf,
  Intent,
  RuleId,
  type DecisionAction,
  type DecisionRecord,
  type ToolOutcome,
} from "@nexo/shared";
import { z } from "zod";

// Builds the decision record of one agent reply from its UI message parts (stage 6 PRD,
// S-06.13 and S-06.14). The model's registrarDecisao call gives intent, confidence,
// rationale and rules; the action and the tools come from what actually ran, so the record
// never claims something that did not happen. Stage 8 adds the rules the code enforced and
// one short subject per tool, both chosen by code (stage 8 PRD, S-08.5 and S-08.6).

type ToolPart = { type: string; state?: string; input?: unknown; output?: unknown };

const DECISION_TOOL = "registrarDecisao";

const DecisionInput = z.object({
  intencao: Intent,
  confianca: Confidence,
  justificativa: z.string(),
  regras: z.array(RuleId),
});

const MISSING: Pick<DecisionRecord, "intent" | "confidence" | "rationale" | "rules"> = {
  intent: "outro",
  confidence: "baixa",
  rationale: "O modelo não registrou a decisão.",
  rules: [],
};

export function buildDecisionRecord(parts: unknown[]): DecisionRecord {
  const tools = parts
    .filter((part): part is ToolPart => isToolPart(part))
    .map((part) => ({ name: part.type.slice("tool-".length), part }));

  // The last registrarDecisao call wins, if the model made several.
  const registered = tools.findLast((t) => t.name === DECISION_TOOL);
  const parsed = DecisionInput.safeParse(registered?.part.input);
  const decision = parsed.success
    ? {
        intent: parsed.data.intencao,
        confidence: parsed.data.confianca,
        rationale: parsed.data.justificativa,
        rules: parsed.data.regras,
      }
    : MISSING;

  const others = tools.filter((t) => t.name !== DECISION_TOOL);
  const ran = others.map((t) => {
    const subject = subjectOf(t.name, t.part.input);
    return { name: t.name, outcome: outcomeOf(t.part), ...(subject ? { subject } : {}) };
  });
  const action = actionOf(ran, decision);

  return {
    ...decision,
    action,
    tools: ran,
    enforcedRules: enforcedRulesOf(ran, extraRules(others, ran, decision)),
    source: "agent",
    registered: parsed.success,
  };
}

// Rules that depend on more than one tool and its outcome (stage 8 tech spec).
function extraRules(
  others: { name: string; part: ToolPart }[],
  ran: { name: string; outcome: ToolOutcome }[],
  decision: Pick<DecisionRecord, "intent">,
): RuleId[] {
  const rules: RuleId[] = [];
  // The ticket picker keeps only the employee's own open tickets (stage 7, S-07.11).
  if (others.some((t) => t.name === "perguntar" && subjectOf(t.name, t.part.input))) {
    rules.push("R7");
  }
  // Out of scope: code can only guarantee that nothing was written.
  const wrote = ran.some((t) => WRITES.has(t.name) && t.outcome === "ok");
  if (decision.intent === "fora_do_escopo" && !wrote) rules.push("R8");
  return rules;
}

const WRITES = new Set([
  "prepararChamado",
  "prepararAtualizacao",
  "prepararReabertura",
  "transferirParaAnalista",
]);

// One short, safe argument per tool; never the whole input, which can be long and personal.
function subjectOf(name: string, input: unknown): string | undefined {
  const fields = (input ?? {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  switch (name) {
    case "consultarChamado":
    case "prepararAtualizacao":
    case "prepararReabertura":
      return text(fields.numero).toUpperCase().slice(0, 20) || undefined;
    case "buscarNaCentral":
      return text(fields.pergunta).slice(0, 80) || undefined;
    case "listarMeusChamados":
      return fields.escopo === "todos" ? "todos" : "abertos";
    case "perguntar":
      return Array.isArray(fields.chamados) ? "chamados" : undefined;
    default:
      return undefined;
  }
}

function isToolPart(part: unknown): part is ToolPart {
  const type = (part as { type?: unknown } | null)?.type;
  return typeof type === "string" && type.startsWith("tool-");
}

function outcomeOf(part: ToolPart): ToolOutcome {
  if (part.state === "output-error") return "erro";
  if (part.state !== "output-available") return "erro";
  const output = (part.output ?? {}) as Record<string, unknown>;
  if (output.indisponivel === true) return "indisponivel";
  if (output.encontrado === false) return "nao_encontrado";
  if (output.permitido === false) return "recusado";
  return "ok";
}

// The most important thing that happened, in a fixed order (stage 6 tech spec; perguntou
// from stage 8).
function actionOf(
  ran: { name: string; outcome: ToolOutcome }[],
  decision: Pick<DecisionRecord, "intent" | "confidence">,
): DecisionAction {
  const ok = (name: string) => ran.some((t) => t.name === name && t.outcome === "ok");
  const any = (name: string) => ran.some((t) => t.name === name);

  if (ok("transferirParaAnalista")) return "transferiu";
  if (["prepararChamado", "prepararAtualizacao", "prepararReabertura"].some(ok)) {
    return "preparou_rascunho";
  }
  if (ran.some((t) => t.name === "prepararReabertura" && t.outcome === "recusado")) {
    return "recusou_reabertura";
  }
  if (ok("descartarRascunho")) return "descartou_rascunho";
  if (any("listarMeusChamados") || any("consultarChamado")) return "consultou_chamados";
  if (any("buscarNaCentral") || any("consultarHorario")) return "respondeu_central";
  if (decision.intent === "fora_do_escopo") return "redirecionou";
  if (decision.confidence === "baixa") return "pediu_esclarecimento";
  if (ok("perguntar")) return "perguntou";
  return "respondeu";
}
