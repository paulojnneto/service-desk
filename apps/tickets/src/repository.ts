import {
  canReopen,
  deadlineFor,
  isOpenStatus,
  isOverdue,
  type CreateTicketInput,
  type Ticket,
  type TicketEvent,
  type TicketStatus,
} from "@nexo/shared";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { queryRows, type Db } from "./db/connect";
import { ticketEvents, tickets } from "./db/schema";

type TicketRow = typeof tickets.$inferSelect;
type EventRow = typeof ticketEvents.$inferSelect;

export type WriteError = "not_found" | "ticket_closed" | "not_resolved" | "reopen_window_expired";

// Every function takes the requester: a ticket of someone else is simply not found,
// so it never leaves the database (R7).
export function ticketsRepository(db: Db) {
  async function find(requesterId: string, number: string) {
    const [row] = await db
      .select()
      .from(tickets)
      .where(and(eq(tickets.number, number), eq(tickets.requesterId, requesterId)));
    return row;
  }

  async function withEvents(row: TicketRow, now: Date): Promise<Ticket> {
    const events = await db
      .select()
      .from(ticketEvents)
      .where(eq(ticketEvents.ticketNumber, row.number))
      .orderBy(asc(ticketEvents.at), asc(ticketEvents.id));
    return toTicket(row, now, events);
  }

  async function addEvent(number: string, event: Omit<EventRow, "id" | "ticketNumber">) {
    await db.insert(ticketEvents).values({ ticketNumber: number, ...event });
  }

  return {
    // Open tickets first, then the most recently updated.
    async list(requesterId: string, scope: "open" | "all", now: Date): Promise<Ticket[]> {
      const closedLast = sql`case when ${tickets.status} in ('resolvido', 'fechado') then 1 else 0 end`;
      const rows = await db
        .select()
        .from(tickets)
        .where(eq(tickets.requesterId, requesterId))
        .orderBy(closedLast, desc(tickets.lastUpdateAt));
      return rows
        .filter((row) => scope === "all" || isOpenStatus(row.status as TicketStatus))
        .map((row) => toTicket(row, now));
    },

    async get(requesterId: string, number: string, now: Date): Promise<Ticket | null> {
      const row = await find(requesterId, number);
      return row ? withEvents(row, now) : null;
    },

    async create(requesterId: string, input: CreateTicketInput, now: Date): Promise<Ticket> {
      // One of two fixed names, never user input, so sql.raw is safe here.
      const sequence = sql.raw(input.type === "INC" ? "'inc_number_seq'" : "'req_number_seq'");
      const [next] = await queryRows<{ value: number }>(
        db,
        sql`select nextval(${sequence})::int as value`,
      );
      const number = `${input.type}-${next!.value}`;

      const [row] = await db
        .insert(tickets)
        .values({
          number,
          ...input,
          status: "aguardando_analista",
          requesterId,
          openedAt: now,
          lastUpdateAt: now,
        })
        .returning();
      await addEvent(number, { kind: "opened", at: now, authorId: requesterId, message: null });
      return withEvents(row!, now);
    },

    // New information from the employee counts as an update for the deadline (S-04.10).
    async addUpdate(
      requesterId: string,
      number: string,
      message: string,
      now: Date,
    ): Promise<Ticket | WriteError> {
      const row = await find(requesterId, number);
      if (!row) return "not_found";
      if (!isOpenStatus(row.status as TicketStatus)) return "ticket_closed";

      await addEvent(number, { kind: "updated", at: now, authorId: requesterId, message });
      const [updated] = await db
        .update(tickets)
        .set({ lastUpdateAt: now })
        .where(eq(tickets.number, number))
        .returning();
      return withEvents(updated!, now);
    },

    // Resolved up to 7 days ago can be reopened (R5).
    async reopen(
      requesterId: string,
      number: string,
      reason: string,
      now: Date,
    ): Promise<Ticket | WriteError> {
      const row = await find(requesterId, number);
      if (!row) return "not_found";
      if (row.status !== "resolvido") return "not_resolved";
      if (!canReopen({ status: "resolvido", resolvedAt: row.resolvedAt }, now)) {
        return "reopen_window_expired";
      }

      await addEvent(number, { kind: "reopened", at: now, authorId: requesterId, message: reason });
      const [updated] = await db
        .update(tickets)
        .set({ status: "aguardando_analista", resolvedAt: null, lastUpdateAt: now })
        .where(eq(tickets.number, number))
        .returning();
      return withEvents(updated!, now);
    },

    // A transfer is recorded with the case summary (R6). It does not move the deadline:
    // an overdue ticket must still look overdue to the analyst who receives it.
    async transfer(
      requesterId: string,
      number: string,
      summary: string,
      now: Date,
    ): Promise<Ticket | WriteError> {
      const row = await find(requesterId, number);
      if (!row) return "not_found";
      if (!isOpenStatus(row.status as TicketStatus)) return "ticket_closed";

      await addEvent(number, {
        kind: "transferred",
        at: now,
        authorId: requesterId,
        message: summary,
      });
      return withEvents(row, now);
    },
  };
}

export function toTicket(row: TicketRow, now: Date, events?: EventRow[]): Ticket {
  const status = row.status as TicketStatus;
  const deadline = {
    priority: row.priority as Ticket["priority"],
    status,
    lastUpdateAt: row.lastUpdateAt,
  };
  const due = deadlineFor(deadline);
  return {
    number: row.number,
    type: row.type as Ticket["type"],
    title: row.title,
    description: row.description,
    category: row.category as Ticket["category"],
    priority: row.priority as Ticket["priority"],
    affected: row.affected as Ticket["affected"],
    status,
    requesterId: row.requesterId,
    openedAt: row.openedAt.toISOString(),
    lastUpdateAt: row.lastUpdateAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    dueAt: due?.toISOString() ?? null,
    overdue: isOverdue(deadline, now),
    canReopen: canReopen({ status, resolvedAt: row.resolvedAt }, now),
    ...(events ? { events: events.map(toEvent) } : {}),
  };
}

function toEvent(row: EventRow): TicketEvent {
  return {
    kind: row.kind as TicketEvent["kind"],
    at: row.at.toISOString(),
    authorId: row.authorId,
    message: row.message,
  };
}
