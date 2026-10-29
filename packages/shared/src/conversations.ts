import { z } from "zod";
import { DecisionRecord } from "./decisions";
import type { DraftView } from "./drafts";

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
  // An analyst's level, "Suporte N2" (stage 9 PRD, decision 12).
  authorLevel: z.string().optional(),
  createdAt: z.string(),
  // The stored order, the cursor of the updates (stage 9 tech spec). Absent on a reply
  // still streaming.
  seq: z.number().optional(),
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

// The analyst holding a conversation (stage 9 tech spec).
export type Holder = { id: string; name: string; level: string };

export type ConversationView = {
  id: string;
  state: ConversationState;
  holder: Holder | null;
  employeeMessages: number;
  limit: number;
  startedAt: string;
  // The draft waiting for "Confirmar" or "Cancelar", if any.
  pendingDraftId: string | null;
  // Every draft of the conversation in its current state, oldest first (stage 7 PRD, S-07.7).
  drafts: DraftView[];
  messages: StoredMessage[];
};

// The employee's last conversation, when an analyst closed it: the next chat says so.
export type LastClosed = { by: string; at: string };

// What changed since the last poll (stage 9 PRD, decision 1). For the employee, only the
// analysts' and the system's messages; the console gets every message.
export type ConversationUpdates = {
  // The conversation they belong to: after a close, the employee's next one is another.
  conversationId: string;
  state: ConversationState;
  holder: Holder | null;
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
