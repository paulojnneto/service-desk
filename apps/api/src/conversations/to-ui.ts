import {
  findPersonById,
  MESSAGES_PER_SESSION,
  type ConversationState,
  type ConversationView,
  type StoredMessage,
} from "@nexo/shared";
import type { ConversationRow, MessageRow } from "./repository";

// Stored rows in the AI SDK UIMessage shape the UI renders (stage 5 tech spec).

export function toStoredMessage(row: MessageRow): StoredMessage {
  const authorName = row.authorId ? findPersonById(row.authorId)?.name : undefined;
  return {
    id: row.id,
    role: row.author === "employee" ? "user" : "assistant",
    parts: row.parts as unknown[],
    metadata: {
      author: row.author as StoredMessage["metadata"]["author"],
      ...(authorName ? { authorName } : {}),
      createdAt: row.createdAt.toISOString(),
    },
  };
}

export function toConversationView(
  conversation: ConversationRow,
  rows: MessageRow[],
): ConversationView {
  return {
    id: conversation.id,
    state: conversation.state as ConversationState,
    employeeMessages: conversation.employeeMessages,
    limit: MESSAGES_PER_SESSION,
    startedAt: conversation.startedAt.toISOString(),
    pendingDraftId: null,
    messages: rows.map(toStoredMessage),
  };
}

// What the agent reads: only the employee's and its own messages, in order. How it reads
// analyst and system messages is decided with the handoff (Stage 9).
export function toAgentHistory(rows: MessageRow[]): StoredMessage[] {
  return rows
    .filter((row) => row.author === "employee" || row.author === "agent")
    .map(toStoredMessage);
}
