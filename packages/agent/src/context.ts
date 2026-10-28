import { RequestContext } from "@mastra/core/request-context";
import type {
  Article,
  Confidence,
  CreateDraftFields,
  DraftDuplicate,
  DraftView,
  Ticket,
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
  handoff(input: HandoffInput): Promise<void>;
  now(): Date;
}

export type DraftInput =
  | { kind: "create"; fields: CreateDraftFields; duplicates: DraftDuplicate[] }
  | { kind: "update"; ticketNumber: string; fields: { message: string } }
  | { kind: "reopen"; ticketNumber: string; fields: { reason: string } };

export const HANDOFF_TRIGGERS = [
  "pedido_do_funcionario",
  "caso_critico",
  "chamado_vencido",
  "baixa_confianca",
] as const;
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
};

export function requestContextFor(values: NexoContext): RequestContext<NexoContext> {
  const context = new RequestContext<NexoContext>();
  context.set("userId", values.userId);
  context.set("firstName", values.firstName);
  context.set("services", values.services);
  if (values.previousConfidence) context.set("previousConfidence", values.previousConfidence);
  return context;
}
