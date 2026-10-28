import { SLA_BY_PRIORITY, TIME_ZONE, type Priority, type TicketStatus } from "@nexo/shared";

// Labels and dates shown by the chat cards, in Portuguese and São Paulo time (stage 7).

export const STATUS_LABEL: Record<TicketStatus, string> = {
  aguardando_analista: "Aguardando analista",
  em_andamento: "Em andamento",
  aprovado: "Aprovado",
  resolvido: "Resolvido",
  fechado: "Fechado",
};

// The dot next to a status, as in the prototype: amber waits, blue moves, green is done.
export const STATUS_DOT: Record<TicketStatus, string> = {
  aguardando_analista: "bg-warning",
  em_andamento: "bg-primary",
  aprovado: "bg-success",
  resolvido: "bg-success",
  fechado: "bg-ink-3",
};

export const STATUS_TEXT: Record<TicketStatus, string> = {
  aguardando_analista: "text-warning-text",
  em_andamento: "text-primary-text",
  aprovado: "text-success-text",
  resolvido: "text-success-text",
  fechado: "text-ink-3",
};

export const PRIORITY_DOT: Record<Priority, string> = {
  critica: "bg-danger",
  alta: "bg-warning",
  media: "bg-ink-3",
  baixa: "bg-rule",
};

export function priorityLabel(priority: Priority): string {
  return SLA_BY_PRIORITY[priority].label;
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function parts(iso: string) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return {
    day: values.day!.padStart(2, "0"),
    month: MONTHS[Number(values.month) - 1]!,
    time: `${values.hour}:${values.minute}`,
  };
}

// "16 out"
export function formatDay(iso: string): string {
  const { day, month } = parts(iso);
  return `${day} ${month}`;
}

// "16 out, 14:20"
export function formatDayTime(iso: string): string {
  const { day, month, time } = parts(iso);
  return `${day} ${month}, ${time}`;
}

// "14:00"
export function formatTime(iso: string): string {
  return parts(iso).time;
}

// "hoje", "ontem", "há 5 dias", counted in calendar days in São Paulo.
export function daysAgo(iso: string, reference: string): string {
  const day = (value: string) => {
    const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE })
      .format(new Date(value))
      .split("-")
      .map(Number);
    return Date.UTC(y!, m! - 1, d!);
  };
  const days = Math.round((day(reference) - day(iso)) / 86_400_000);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  return `há ${days} dias`;
}
