import type { Impact, TicketType, Urgency } from "@nexo/shared";

// Portuguese labels of the draft fields, shared by the card and the edit form.

export const TYPE_LABEL: Record<TicketType, string> = { INC: "Incidente", REQ: "Requisição" };

export const AFFECTED_LABEL: Record<Impact, string> = {
  so_eu: "Somente você",
  equipe: "Sua equipe",
  empresa: "Toda a empresa",
};

export const URGENCY_LABEL: Record<Urgency, string> = {
  parado: "Estou parado",
  compromisso_hoje: "Tenho compromisso hoje",
  contornavel: "Consigo contornar",
  sem_urgencia: "Sem urgência",
};

// Shown on "Confirmar", as in the prototype (stage 7 PRD, S-07.9).
export const CONFIRM_SHORTCUT =
  typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.userAgent)
    ? "⌘↵"
    : "Ctrl ↵";
