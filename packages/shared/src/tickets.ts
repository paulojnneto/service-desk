import { z } from "zod";
import { Category, Priority, TicketType } from "./service-desk";

// Contracts of the ticket service, shared by the service and its client.
// Values are in Portuguese because they are shown in the UI and stored with the tickets.

export const TicketStatus = z.enum([
  "aguardando_analista",
  "em_andamento",
  "aprovado",
  "resolvido",
  "fechado",
]);
export type TicketStatus = z.infer<typeof TicketStatus>;

// Open means not resolved or closed: an approved request not delivered yet is still open.
export function isOpenStatus(status: TicketStatus): boolean {
  return status !== "resolvido" && status !== "fechado";
}

export const Affected = z.enum(["so_eu", "equipe", "empresa"]);
export type Affected = z.infer<typeof Affected>;

export const EventKind = z.enum(["opened", "updated", "status_changed", "reopened", "transferred"]);
export type EventKind = z.infer<typeof EventKind>;

export const TicketEvent = z.object({
  kind: EventKind,
  at: z.string(),
  authorId: z.string(),
  message: z.string().nullable(),
});
export type TicketEvent = z.infer<typeof TicketEvent>;

export const Ticket = z.object({
  number: z.string(),
  type: TicketType,
  title: z.string(),
  description: z.string(),
  category: Category,
  priority: Priority,
  affected: Affected,
  status: TicketStatus,
  requesterId: z.string(),
  openedAt: z.string(),
  lastUpdateAt: z.string(),
  resolvedAt: z.string().nullable(),
  dueAt: z.string().nullable(),
  overdue: z.boolean(),
  canReopen: z.boolean(),
  events: z.array(TicketEvent).optional(),
});
export type Ticket = z.infer<typeof Ticket>;

export const CreateTicketInput = z.object({
  type: TicketType,
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(2000),
  category: Category,
  priority: Priority,
  affected: Affected,
});
export type CreateTicketInput = z.infer<typeof CreateTicketInput>;

export const AddUpdateInput = z.object({ message: z.string().trim().min(1).max(2000) });
export const ReopenInput = z.object({ reason: z.string().trim().min(1).max(2000) });
export const TransferInput = z.object({ summary: z.string().trim().min(1).max(4000) });

export const Article = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
});
export type Article = z.infer<typeof Article>;

export type TicketErrorCode =
  | "invalid_input"
  | "invalid_token"
  | "unknown_requester"
  | "missing_idempotency_key"
  | "not_found"
  | "ticket_closed"
  | "not_resolved"
  | "reopen_window_expired"
  | "unavailable";
