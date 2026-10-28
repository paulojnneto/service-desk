import type { Ticket } from "@nexo/shared";
import type { AgentServices } from "../context";

// Helpers shared by the tools.

// Tools see the request context untyped; the API always puts the services there.
export function servicesFrom(context: { requestContext?: { get(key: string): unknown } }) {
  const services = context.requestContext?.get("services") as AgentServices | undefined;
  if (!services) throw new Error("The agent ran without services in its request context.");
  return services;
}

// What a failed service call means for the conversation. The ticket service answers
// "not found" for another person's ticket too, so both read the same (R7).
export type Failure = { indisponivel: true } | { encontrado: false };

export function failureOf(error: unknown): Failure {
  const kind = (error as { kind?: string } | null)?.kind;
  if (kind === "not_found") return { encontrado: false };
  if (kind === "unavailable") return { indisponivel: true };
  throw error;
}

// The fields of a ticket the agent needs, in Portuguese for the model.
export function ticketSummary(ticket: Ticket) {
  return {
    numero: ticket.number,
    titulo: ticket.title,
    tipo: ticket.type,
    categoria: ticket.category,
    prioridade: ticket.priority,
    status: ticket.status,
    abertoEm: ticket.openedAt,
    ultimaAtualizacao: ticket.lastUpdateAt,
    prazo: ticket.dueAt,
    vencido: ticket.overdue,
    podeReabrir: ticket.canReopen,
  };
}

export function isClosedStatus(status: Ticket["status"]) {
  return status === "resolvido" || status === "fechado";
}
