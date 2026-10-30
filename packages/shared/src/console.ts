import { z } from "zod";
import {
  MAX_MESSAGE_LENGTH,
  type ConversationState,
  type ConversationView,
  type Holder,
  type MessageAuthor,
} from "./conversations";
import type { Confidence } from "./decisions";
import { analystLevelLabel, findPersonById, initials, type AvatarColors } from "./directory";
import type { Ticket } from "./tickets";

// Contracts of the handoff and the analyst console (stage 9 tech spec), shared by the API,
// the agent and the UI.

// Why the agent handed the conversation off (Annex A, R6).
export const HandoffReason = z.enum([
  "pedido_do_funcionario",
  "caso_critico",
  "chamado_vencido",
  "baixa_confianca",
]);
export type HandoffReason = z.infer<typeof HandoffReason>;

export const HANDOFF_REASON_LABELS: Record<HandoffReason, string> = {
  pedido_do_funcionario: "Pedido do funcionário",
  caso_critico: "Caso crítico",
  chamado_vencido: "Chamado vencido",
  baixa_confianca: "Agente sem confiança",
};

export type HandoffView = {
  reason: HandoffReason;
  summary: string;
  ticketNumber: string | null;
  at: string;
};

// The analyst holding a conversation, as both sides show them ("Rafael Lima · Suporte N2").
export function holderFor(analystId: string | null): Holder | null {
  const person = analystId ? findPersonById(analystId) : undefined;
  if (person?.role !== "analyst") return null;
  return { id: person.id, name: person.name, level: analystLevelLabel(person.level) };
}

export type ConsoleEmployee = {
  id: string;
  name: string;
  department: string;
  initials: string;
  avatar: AvatarColors;
};

export function consoleEmployee(employeeId: string): ConsoleEmployee | null {
  const person = findPersonById(employeeId);
  if (person?.role !== "employee") return null;
  return {
    id: person.id,
    name: person.name,
    department: person.department,
    initials: initials(person.name),
    avatar: person.avatar,
  };
}

// The list's filters (stage 9 PRD, S-09.4 and decision 8).
export const ConsoleFilter = z.enum(["para_voce", "com_agente", "minhas", "todas"]);
export type ConsoleFilter = z.infer<typeof ConsoleFilter>;

export type ConversationSummary = {
  id: string;
  employee: ConsoleEmployee;
  state: ConversationState;
  holder: Holder | null;
  lastMessage: { author: MessageAuthor; text: string; at: string } | null;
  // Of the agent's latest decision, for "Agente pediu ajuda · confiança baixa" (A2).
  lastConfidence: Confidence | null;
  // The latest handoff, while the conversation waits or is held.
  handoff: HandoffView | null;
  updatedAt: string;
};

export type ConsoleList = {
  conversations: ConversationSummary[];
  counts: Record<ConsoleFilter, number>;
};

export type AnalystConversationView = ConversationView & {
  employee: ConsoleEmployee;
  handoffs: HandoffView[];
  // The conversation's ticket: the latest one a handoff named or a confirmed draft wrote.
  ticketNumber: string | null;
};

// The ticket panel (S-09.6): the related ticket first, then the employee's others.
export type ConsoleTickets = { related: Ticket | null; others: Ticket[] };

// An analyst's reply (S-09.8). The client id makes a resend harmless.
export const AnalystMessageInput = z.object({
  clientId: z.string().min(1).max(100),
  text: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
});
export type AnalystMessageInput = z.infer<typeof AnalystMessageInput>;
