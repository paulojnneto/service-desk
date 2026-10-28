import { TZDate } from "@date-fns/tz";
import { addDays, addHours, isWeekend } from "date-fns";
import type { Priority } from "./service-desk";
import { isOpenStatus, type TicketStatus } from "./tickets";

// Deadlines from Annex A (R9), counted in São Paulo time whatever the server's time zone.
// Public holidays are out of scope (product PRD, section 7).
export const TIME_ZONE = "America/Sao_Paulo";
export const BUSINESS_HOURS = { start: 8, end: 18 } as const;
export const REOPEN_WINDOW_DAYS = 7;

const HOUR_MS = 60 * 60 * 1000;

type DeadlineInput = { priority: Priority; status: TicketStatus; lastUpdateAt: Date };

// The deadline counts from the last update, for the first response and for each update.
export function dueAt(priority: Priority, lastUpdateAt: Date): Date {
  switch (priority) {
    case "critica":
      return addHours(lastUpdateAt, 1); // wall-clock hour, any day
    case "alta":
      return addBusinessHours(lastUpdateAt, 4);
    case "media":
      return addBusinessDays(lastUpdateAt, 3);
    case "baixa":
      return addBusinessDays(lastUpdateAt, 5);
  }
}

// Resolved and closed tickets are never overdue.
export function deadlineFor(ticket: DeadlineInput): Date | null {
  return isOpenStatus(ticket.status) ? dueAt(ticket.priority, ticket.lastUpdateAt) : null;
}

export function isOverdue(ticket: DeadlineInput, now: Date): boolean {
  const due = deadlineFor(ticket);
  return due !== null && now.getTime() > due.getTime();
}

// Resolved up to 7 calendar days ago (R5): the rule says "7 dias", not "7 dias úteis".
export function canReopen(
  ticket: { status: TicketStatus; resolvedAt: Date | null },
  now: Date,
): boolean {
  if (ticket.status !== "resolvido" || !ticket.resolvedAt) return false;
  return now.getTime() - ticket.resolvedAt.getTime() <= REOPEN_WINDOW_DAYS * 24 * HOUR_MS;
}

// The first moment at or after `date` that falls inside business hours.
export function nextBusinessMoment(date: Date): Date {
  let local = new TZDate(date.getTime(), TIME_ZONE);
  if (local.getHours() >= BUSINESS_HOURS.end) local = startOfBusinessDay(addDays(local, 1));
  else if (local.getHours() < BUSINESS_HOURS.start) local = startOfBusinessDay(local);
  while (isWeekend(local)) local = startOfBusinessDay(addDays(local, 1));
  return new Date(local.getTime());
}

// "4 horas úteis": only the time between 8:00 and 18:00, Monday to Friday, counts.
export function addBusinessHours(from: Date, hours: number): Date {
  let cursor = new TZDate(nextBusinessMoment(from).getTime(), TIME_ZONE);
  let remaining = hours * HOUR_MS;
  for (;;) {
    const endOfDay = new TZDate(cursor.getTime(), TIME_ZONE);
    endOfDay.setHours(BUSINESS_HOURS.end, 0, 0, 0);
    const available = endOfDay.getTime() - cursor.getTime();
    if (remaining <= available) return new Date(cursor.getTime() + remaining);
    remaining -= available;
    cursor = new TZDate(nextBusinessMoment(endOfDay).getTime(), TIME_ZONE);
  }
}

// "3 dias úteis": the same time of day, N business days later. An update outside
// business hours starts counting at the next business moment.
export function addBusinessDays(from: Date, days: number): Date {
  let local = new TZDate(nextBusinessMoment(from).getTime(), TIME_ZONE);
  for (let added = 0; added < days;) {
    local = addDays(local, 1);
    if (!isWeekend(local)) added += 1;
  }
  return new Date(local.getTime());
}

function startOfBusinessDay(date: TZDate): TZDate {
  const start = new TZDate(date.getTime(), TIME_ZONE);
  start.setHours(BUSINESS_HOURS.start, 0, 0, 0);
  return start;
}
