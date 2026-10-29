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

// What the agent reads, in order: the employee's and its own messages as they are, and the
// analysts' and the system's as assistant text with a prefix, so it knows what a person did
// but cannot take those words for its own (stage 9 PRD, S-09.11 and decision 6).
export function toAgentHistory(rows: MessageRow[]): StoredMessage[] {
  return rows.map((row) => {
    const message = toStoredMessage(row);
    if (row.author === "employee" || row.author === "agent") return message;
    const prefix =
      row.author === "analyst"
        ? `[Analista ${message.metadata.authorName ?? "do service desk"}]`
        : "[Nota do sistema]";
    return { ...message, parts: [{ type: "text", text: `${prefix} ${textOf(row.parts)}` }] };
  });
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
