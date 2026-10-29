import { buildDecisionRecord } from "@nexo/agent";
import {
  analystLevelLabel,
  findPersonById,
  holderFor,
  MESSAGES_PER_SESSION,
  type ConversationState,
  type ConversationView,
  type DecisionRecord,
  type DraftView,
  type HandoffReason,
  type HandoffView,
  type QuestionView,
  type StoredMessage,
} from "@nexo/shared";
import type { ConversationRow, DecisionRow, HandoffRow, MessageRow } from "./repository";

// Stored rows in the AI SDK UIMessage shape the UI renders (stage 5 tech spec).

export function toStoredMessage(row: MessageRow, decision?: DecisionRow): StoredMessage {
  const author = row.authorId ? findPersonById(row.authorId) : undefined;
  const authorName = author?.name;
  const authorLevel = author?.role === "analyst" ? analystLevelLabel(author.level) : undefined;
  return {
    id: row.id,
    role: row.author === "employee" ? "user" : "assistant",
    parts: row.parts as unknown[],
    metadata: {
      author: row.author as StoredMessage["metadata"]["author"],
      ...(authorName ? { authorName } : {}),
      ...(authorLevel ? { authorLevel } : {}),
      createdAt: row.createdAt.toISOString(),
      seq: row.seq,
      ...(decision ? { decision: toDecisionRecord(decision) } : {}),
    },
  };
}

function toDecisionRecord(row: DecisionRow): DecisionRecord {
  return {
    intent: row.intent as DecisionRecord["intent"],
    action: row.action as DecisionRecord["action"],
    confidence: row.confidence as DecisionRecord["confidence"],
    rationale: row.rationale,
    rules: row.rules as DecisionRecord["rules"],
    enforcedRules: row.enforcedRules as DecisionRecord["enforcedRules"],
    tools: row.tools as DecisionRecord["tools"],
    source: row.source as DecisionRecord["source"],
    registered: row.registered,
  };
}

export function toHandoffView(row: HandoffRow): HandoffView {
  return {
    reason: row.reason as HandoffReason,
    summary: row.summary,
    ticketNumber: row.ticketNumber,
    at: row.createdAt.toISOString(),
  };
}

export function toConversationView(
  conversation: ConversationRow,
  rows: MessageRow[],
  decisions: DecisionRow[] = [],
  pendingDraftId: string | null = null,
  drafts: DraftView[] = [],
): ConversationView {
  const byMessage = new Map(decisions.map((d) => [d.messageId, d]));
  return {
    id: conversation.id,
    state: conversation.state as ConversationState,
    holder: holderFor(conversation.holderId),
    employeeMessages: conversation.employeeMessages,
    limit: MESSAGES_PER_SESSION,
    startedAt: conversation.startedAt.toISOString(),
    pendingDraftId,
    drafts,
    messages: rows.map((row) => toStoredMessage(row, byMessage.get(row.id))),
  };
}

// What the agent reads, in order: the employee's and its own messages, and the analysts' and
// the system's as assistant text with a prefix, so it knows what a person did but cannot take
// those words for its own (stage 9 PRD, S-09.11 and decision 6). The agent's last reply goes
// as it is; in older ones the tool parts become short lines, so old ticket lists and article
// bodies are not sent again on every call (stage 11 PRD, S-11.3 and decision 5).
export function toAgentHistory(rows: MessageRow[]): StoredMessage[] {
  const lastAgent = rows.findLastIndex((row) => row.author === "agent");
  return (
    rows
      .map((row, index) => {
        const message = toStoredMessage(row);
        if (row.author === "employee") return message;
        if (row.author === "agent") {
          return index === lastAgent ? message : { ...message, parts: compactParts(row.parts) };
        }
        const prefix =
          row.author === "analyst"
            ? `[Analista ${message.metadata.authorName ?? "do service desk"}]`
            : "[Nota do sistema]";
        return { ...message, parts: [{ type: "text", text: `${prefix} ${textOf(row.parts)}` }] };
      })
      // An older reply with nothing left to say is not sent at all.
      .filter((message) => message.parts.length > 0)
  );
}

type Part = { type: string; text?: string; output?: unknown; state?: string };

// The reply's text, then one line with the tools it ran and one with the question it asked.
function compactParts(parts: unknown): unknown[] {
  const list = (Array.isArray(parts) ? parts : []) as Part[];
  const texts = list.filter((part) => part.type === "text" && part.text?.trim());
  const tools = buildDecisionRecord(list).tools.filter((tool) => tool.name !== "perguntar");
  const lines: string[] = [];
  if (tools.length > 0) {
    const ran = tools.map((t) => `${t.name}${t.subject ? ` ${t.subject}` : ""} (${t.outcome})`);
    lines.push(`[Ferramentas: ${ran.join(", ")}]`);
  }
  const asked = list.findLast(
    (part) => part.type === "tool-perguntar" && part.state === "output-available",
  );
  const question = (asked?.output as { pergunta?: QuestionView } | undefined)?.pergunta;
  if (question) {
    const choices =
      question.kind === "options"
        ? `Opções: ${question.options.join(", ")}`
        : `Chamados: ${question.tickets.map((t) => t.number).join(", ")}`;
    lines.push(`[Pergunta: ${question.question} ${choices}]`);
  }
  return [...texts, ...lines.map((text) => ({ type: "text", text }))];
}

function textOf(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) =>
      (part as { type?: string }).type === "text" ? (part as { text: string }).text : "",
    )
    .join(" ")
    .trim();
}
