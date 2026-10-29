import {
  consoleEmployee,
  holderFor,
  type Confidence,
  type ConsoleFilter,
  type ConsoleList,
  type ConversationState,
  type ConversationSummary,
  type HandoffView,
  type MessageAuthor,
} from "@nexo/shared";
import type { ConversationRow, MessageRow } from "./repository";

// The analyst console's list (stage 9 PRD, S-09.3, S-09.4 and decision 8), as pure functions
// over rows the repository already read, so filters, counts and search are tested without
// a database.

export type SummaryInput = {
  conversation: ConversationRow;
  lastMessage: MessageRow | null;
  lastConfidence: Confidence | null;
  handoff: HandoffView | null;
};

const PREVIEW_LENGTH = 140;

export function summarize(input: SummaryInput): ConversationSummary | null {
  const { conversation, lastMessage } = input;
  const employee = consoleEmployee(conversation.employeeId);
  if (!employee) return null;
  const state = conversation.state as ConversationState;
  return {
    id: conversation.id,
    employee,
    state,
    holder: holderFor(conversation.holderId),
    lastMessage: lastMessage
      ? {
          author: lastMessage.author as MessageAuthor,
          text: previewOf(lastMessage.parts).slice(0, PREVIEW_LENGTH),
          at: lastMessage.createdAt.toISOString(),
        }
      : null,
    lastConfidence: input.lastConfidence,
    // The summary matters while a person is needed or involved.
    handoff: state === "waiting_analyst" || state === "with_analyst" ? input.handoff : null,
    updatedAt: conversation.updatedAt.toISOString(),
  };
}

function previewOf(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) =>
      (part as { type?: string }).type === "text" ? (part as { text: string }).text : "",
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchesFilter(
  summary: ConversationSummary,
  filter: ConsoleFilter,
  analystId: string,
): boolean {
  switch (filter) {
    case "para_voce":
      return (
        summary.state === "waiting_analyst" ||
        (summary.state === "with_agent" && summary.lastConfidence === "baixa")
      );
    case "com_agente":
      return summary.state === "with_agent";
    case "minhas":
      return summary.holder?.id === analystId;
    case "todas":
      return true;
  }
}

const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

// By the person's name, ignoring accents, or by a ticket number found in the conversation.
export function matchesSearch(
  summary: ConversationSummary,
  query: string,
  ticketHits: ReadonlySet<string>,
): boolean {
  const q = fold(query);
  if (!q) return true;
  return fold(summary.employee.name).includes(q) || ticketHits.has(summary.id);
}

// Waiting conversations first, then the most recent activity.
function byUrgency(a: ConversationSummary, b: ConversationSummary): number {
  const waiting = (s: ConversationSummary) => (s.state === "waiting_analyst" ? 0 : 1);
  return waiting(a) - waiting(b) || b.updatedAt.localeCompare(a.updatedAt);
}

export function consoleList(
  summaries: ConversationSummary[],
  options: {
    filter: ConsoleFilter;
    query: string;
    analystId: string;
    ticketHits: ReadonlySet<string>;
  },
): ConsoleList {
  const found = summaries.filter((s) => matchesSearch(s, options.query, options.ticketHits));
  const count = (filter: ConsoleFilter) =>
    found.filter((s) => matchesFilter(s, filter, options.analystId)).length;
  return {
    conversations: found
      .filter((s) => matchesFilter(s, options.filter, options.analystId))
      .sort(byUrgency),
    counts: {
      para_voce: count("para_voce"),
      com_agente: count("com_agente"),
      minhas: count("minhas"),
      todas: count("todas"),
    },
  };
}
