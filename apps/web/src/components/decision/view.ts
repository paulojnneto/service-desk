import {
  ACTION_LABELS,
  CONFIDENCE_LABELS,
  INTENT_LABELS,
  NO_DECISION,
  OUTCOME_LABELS,
  RULE_LABELS,
  SERVER_DECISION_NOTE,
  toolLabel,
  UNREGISTERED_DECISION,
  type Confidence,
  type DecisionRecord,
  type RuleId,
  type ToolOutcome,
} from "@nexo/shared";

// What the decision detail shows, from the record alone (stage 8 tech spec). A pure function,
// so the employee chat and the analyst console (Stage 9) render the same thing, and the
// tests run without a DOM.

export type RuleView = { code: RuleId; title: string };

export type DecisionView =
  | { kind: "none"; note: string }
  | {
      kind: "recorded";
      // Who decided, when it was not the model's judgment (S-08.7, S-08.8).
      note: string | null;
      understood: string;
      did: string;
      // null for the server's decisions: no model judged anything.
      confidence: { level: Confidence; word: string; meaning: string } | null;
      rationale: string | null;
      tools: { key: string; label: string; outcome: ToolOutcome; outcomeLabel: string }[];
      enforced: RuleView[];
      // Cited by the model and not already enforced, so each rule appears once.
      cited: RuleView[];
    };

const rule = (code: RuleId): RuleView => ({ code, title: RULE_LABELS[code] ?? code });

export function decisionView(record: DecisionRecord | undefined): DecisionView {
  if (!record) return { kind: "none", note: NO_DECISION };
  const server = record.source === "server";
  const registered = record.registered !== false;
  const enforced = record.enforcedRules ?? [];
  return {
    kind: "recorded",
    note: server ? SERVER_DECISION_NOTE : registered ? null : UNREGISTERED_DECISION,
    understood: INTENT_LABELS[record.intent] ?? record.intent,
    did: ACTION_LABELS[record.action] ?? record.action,
    confidence: server
      ? null
      : { level: record.confidence, ...CONFIDENCE_LABELS[record.confidence] },
    // The fallback rationale of an unregistered turn says nothing the note does not.
    rationale: registered ? record.rationale : null,
    tools: record.tools.map((tool, i) => ({
      key: `${i}-${tool.name}`,
      label: toolLabel(tool.name, tool.subject),
      outcome: tool.outcome,
      outcomeLabel: OUTCOME_LABELS[tool.outcome] ?? tool.outcome,
    })),
    enforced: enforced.map(rule),
    cited: record.rules.filter((code) => !enforced.includes(code)).map(rule),
  };
}

// What the collapsed control adds after "Por quê?": the confidence, only when it is média or
// baixa, so a doubtful decision stands out without opening anything (S-08.3).
export function confidenceSummary(
  record: DecisionRecord | undefined,
): { level: Confidence; text: string } | null {
  if (!record || record.source === "server" || record.confidence === "alta") return null;
  return {
    level: record.confidence,
    text: `confiança ${CONFIDENCE_LABELS[record.confidence].word}`,
  };
}
