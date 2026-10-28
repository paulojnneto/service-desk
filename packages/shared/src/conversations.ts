import { z } from "zod";
import { DecisionRecord } from "./decisions";

// Contracts of the stored conversations, shared by the API and the UI (stage 5 tech spec).

// Open means anything except closed; an employee has at most one open conversation.
export const ConversationState = z.enum([
  "with_agent",
  "waiting_analyst",
  "with_analyst",
  "closed",
]);
export type ConversationState = z.infer<typeof ConversationState>;

export const MessageAuthor = z.enum(["employee", "agent", "analyst", "system"]);
export type MessageAuthor = z.infer<typeof MessageAuthor>;

// Attached to every stored message as the AI SDK UIMessage metadata.
export const MessageMetadata = z.object({
  author: MessageAuthor,
  authorName: z.string().optional(),
  createdAt: z.string(),
  // Agent replies only (stage 6 PRD, S-06.13).
  decision: DecisionRecord.optional(),
});
export type MessageMetadata = z.infer<typeof MessageMetadata>;

// A stored message in the AI SDK UIMessage shape. The employee is "user"; agent,
// analyst and system are "assistant", told apart by metadata.author.
export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  parts: unknown[];
  metadata: MessageMetadata;
};

export type ConversationView = {
  id: string;
  state: ConversationState;
  employeeMessages: number;
  limit: number;
  startedAt: string;
  // The draft waiting for "Confirmar" or "Cancelar", if any.
  pendingDraftId: string | null;
  messages: StoredMessage[];
};

export const ChatErrorCode = z.enum([
  "message_limit_reached",
  "already_answered",
  "invalid_input",
  "unavailable",
]);
export type ChatErrorCode = z.infer<typeof ChatErrorCode>;

// Longest text the employee can send in one message.
export const MAX_MESSAGE_LENGTH = 4000;
