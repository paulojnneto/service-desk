import {
  findPersonById,
  MESSAGES_PER_SESSION,
  type ConversationState,
  type ConversationView,
  type DecisionRecord,
  type DraftView,
  type StoredMessage,
} from "@nexo/shared";
import type { ConversationRow, DecisionRow, MessageRow } from "./repository";

// Stored rows in the AI SDK UIMessage shape the UI renders (stage 5 tech spec).

export function toStoredMessage(row: MessageRow, decision?: DecisionRow): StoredMessage {
  const authorName = row.authorId ? findPersonById(row.authorId)?.name : undefined;
  return {
    id: row.id,
    role: row.author === "employee" ? "user" : "assistant",
    parts: row.parts as unknown[],
    metadata: {
      author: row.author as StoredMessage["metadata"]["author"],
      ...(authorName ? { authorName } : {}),
      createdAt: row.createdAt.toISOString(),
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
    employeeMessages: conversation.employeeMessages,
    limit: MESSAGES_PER_SESSION,
    startedAt: conversation.startedAt.toISOString(),
    pendingDraftId,
    drafts,
    messages: rows.map((row) => toStoredMessage(row, byMessage.get(row.id))),
  };
}

// What the agent reads: only the employee's and its own messages, in order. How it reads
// analyst and system messages is decided with the handoff (Stage 9).
export function toAgentHistory(rows: MessageRow[]): StoredMessage[] {
  return rows
    .filter((row) => row.author === "employee" || row.author === "agent")
    .map((row) => toStoredMessage(row));
}
