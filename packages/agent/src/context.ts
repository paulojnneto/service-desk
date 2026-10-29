import { RequestContext } from "@mastra/core/request-context";
import {
  HandoffReason,
  type Article,
  type Confidence,
  type CreateDraftFields,
  type DraftDuplicate,
  type DraftView,
  type Ticket,
} from "@nexo/shared";

// What the agent's tools can do, built by the API for one person and one conversation
// (stage 6 tech spec). Tickets are read only: creating, updating and reopening happen only
// when the employee confirms a draft, in the API, never through a tool (S-06.5).
export interface AgentServices {
  tickets: {
    list(scope: "open" | "all"): Promise<Ticket[]>;
    get(number: string): Promise<Ticket>;
    searchArticles(question: string): Promise<Article[]>;
  };
  drafts: {
    // Stores the draft, replacing the one waiting in the conversation, if any.
    prepare(input: DraftInput): Promise<DraftView>;
    // Cancels the waiting draft; false when there was none.
    discard(): Promise<boolean>;
  };
  // The only write the model can trigger: transfer event and conversation state (S-06.12).
  // false when the conversation is no longer with the agent (stage 9).
  handoff(input: HandoffInput): Promise<boolean>;
  now(): Date;
}

export type DraftInput =
  | { kind: "create"; fields: CreateDraftFields; duplicates: DraftDuplicate[] }
  | { kind: "update"; ticketNumber: string; fields: { message: string } }
  | { kind: "reopen"; ticketNumber: string; fields: { reason: string } };

// The reasons are shared with the console, which shows them (stage 9).
export const HANDOFF_TRIGGERS = HandoffReason.options;
export type HandoffTrigger = (typeof HANDOFF_TRIGGERS)[number];
export type HandoffInput = { trigger: HandoffTrigger; summary: string; ticketNumber?: string };

// Values the server passes to the agent on every request. Tools read the signed-in
// person and the services from here, never from the conversation.
export type NexoContext = {
  userId: string;
  firstName: string;
  services: AgentServices;
  // Confidence of the agent's previous reply in this conversation (S-06.15).
  previousConfidence?: Confidence;
  // The draft waiting for "Confirmar", with any change the employee made through "Editar"
  // (stage 7 tech spec, PRD clarification).
  waitingDraft?: DraftView;
};

export function requestContextFor(values: NexoContext): RequestContext<NexoContext> {
  const context = new RequestContext<NexoContext>();
  context.set("userId", values.userId);
  context.set("firstName", values.firstName);
  context.set("services", values.services);
  if (values.previousConfidence) context.set("previousConfidence", values.previousConfidence);
  if (values.waitingDraft) context.set("waitingDraft", values.waitingDraft);
  return context;
}
