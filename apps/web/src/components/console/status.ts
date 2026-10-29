import type { ConversationState, ConversationSummary, Holder } from "@nexo/shared";

// The status of a conversation, as the list and the header of Screen 4 show it (stage 9 PRD,
// S-09.3). Pure, so each state and reason is tested without a DOM.

export type StatusTone = "danger" | "warning" | "primary" | "violet" | "success" | "muted";
export type RowStatus = { text: string; tone: StatusTone };

export function rowStatus(summary: ConversationSummary, analystId: string): RowStatus {
  switch (summary.state) {
    case "closed":
      return { text: "Encerrada", tone: "muted" };
    case "with_analyst":
      return heldStatus(summary.holder, analystId);
    case "waiting_analyst":
      if (summary.handoff?.reason === "baixa_confianca") {
        return { text: "Agente pediu ajuda · confiança baixa", tone: "warning" };
      }
      return {
        text: summary.handoff?.ticketNumber
          ? `Transferida · ${summary.handoff.ticketNumber}`
          : "Transferida",
        tone: "danger",
      };
    case "with_agent":
      return summary.lastConfidence === "baixa"
        ? { text: "Agente com confiança baixa", tone: "warning" }
        : { text: "Agente atendendo", tone: "success" };
  }
}

export function heldStatus(holder: Holder | null, analystId: string): RowStatus {
  if (holder?.id === analystId) return { text: "Você está atendendo", tone: "primary" };
  return { text: `${holder?.name ?? "Um analista"} está atendendo`, tone: "violet" };
}

// The header's badge for the opened conversation.
export function stateBadge(
  state: ConversationState,
  holder: Holder | null,
  analystId: string,
): RowStatus {
  switch (state) {
    case "waiting_analyst":
      return { text: "Aguardando atendente", tone: "warning" };
    case "with_analyst":
      return heldStatus(holder, analystId);
    case "with_agent":
      return { text: "Com o Nexo Assist", tone: "success" };
    case "closed":
      return { text: "Encerrada", tone: "muted" };
  }
}

// "há 12 min", "há 2 h", "há 3 dias": how long a conversation has waited (PRD, out of scope:
// no response-time target, only the waiting time).
export function waitingFor(since: string, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(since).getTime()) / 60_000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return `há ${Math.floor(hours / 24)} dias`;
}

export const TONE_DOT: Record<StatusTone, string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  primary: "bg-primary",
  violet: "bg-violet",
  success: "bg-success",
  muted: "bg-ink-3",
};

export const TONE_TEXT: Record<StatusTone, string> = {
  danger: "text-danger-text",
  warning: "text-warning-text",
  primary: "text-primary-text",
  violet: "text-violet-text",
  success: "text-success-text",
  muted: "text-ink-3",
};
