import { TZDate } from "@date-fns/tz";
import {
  enforcedRulesOf,
  SLA_BY_PRIORITY,
  TIME_ZONE,
  type DecisionRecord,
  type DraftView,
  type Person,
  type StoredMessage,
  type Ticket,
} from "@nexo/shared";
import type { TicketsClient } from "@nexo/tickets-client";
import { appendMessage, findOpenConversation } from "../conversations/repository";
import { toStoredMessage } from "../conversations/to-ui";
import type { Db } from "../db/connect";
import { findDraft, moveDraft, toDraftView, type DraftRow } from "./repository";

// The only place where a ticket is created, updated or reopened (stage 6 PRD, S-06.5):
// when the employee confirms a draft. The model is not involved; the reply and its decision
// record are written by this code and say exactly what the server did, marked as the
// server's (stage 8 PRD, S-08.7).

export type DraftOutcome =
  | { status: "done"; draft: DraftView; message: StoredMessage | null }
  | { status: "refused"; draft: DraftView; message: StoredMessage | null }
  | { status: "not_found" }
  | { status: "in_progress" }
  | { status: "closed" }
  | { status: "unavailable" };

type Deps = { db: Db; tickets: TicketsClient; person: Person; now: () => Date };

export async function confirmDraft(deps: Deps, draftId: string): Promise<DraftOutcome> {
  const { db, person, now } = deps;
  const found = await ownWaitingDraft(db, person.id, draftId);
  if (found.status !== "waiting") return found;

  // Only one confirmation wins: a double click finds the draft already "confirming".
  const draft = await moveDraft(db, person.id, draftId, "pending", "confirming", now());
  if (!draft) return answerFor(await findDraft(db, person.id, draftId));

  let ticket: Ticket;
  try {
    ticket = await write(deps.tickets.as(person.id), draft);
  } catch (error) {
    const kind = (error as { kind?: string }).kind;
    if (kind === "unavailable") {
      // The draft survives the outage (S-06.16).
      await moveDraft(db, person.id, draftId, "confirming", "pending", now());
      return { status: "unavailable" };
    }
    if (kind !== "conflict" && kind !== "not_found" && kind !== "invalid_request") throw error;
    const cancelled = await moveDraft(db, person.id, draftId, "confirming", "cancelled", now());
    const code = (error as { code?: string }).code ?? "";
    const message = await reply(db, person.id, now(), refusalText(draft, code), {
      ...decisionFor(draft, "recusado"),
      rationale: `O sistema de chamados recusou o rascunho D-${draft.number}: ${code}.`,
    });
    return { status: "refused", draft: toDraftView(cancelled ?? draft), message };
  }

  const confirmed = await moveDraft(
    db,
    person.id,
    draftId,
    "confirming",
    "confirmed",
    now(),
    ticket.number,
  );
  const message = await reply(
    db,
    person.id,
    now(),
    successText(draft, ticket),
    decisionFor(draft, "ok", ticket),
    ticket,
  );
  return { status: "done", draft: toDraftView(confirmed ?? draft), message };
}

export async function cancelDraft(deps: Omit<Deps, "tickets">, draftId: string) {
  const { db, person, now } = deps;
  const found = await ownWaitingDraft(db, person.id, draftId);
  if (found.status !== "waiting") return found;

  const cancelled = await moveDraft(db, person.id, draftId, "pending", "cancelled", now());
  if (!cancelled) return answerFor(await findDraft(db, person.id, draftId));
  const message = await reply(
    db,
    person.id,
    now(),
    `Tudo bem, descartei o rascunho D-${cancelled.number}. Nada foi criado nem alterado.`,
    serverDecision({
      intent: intentOf(cancelled),
      action: "cancelou_rascunho",
      rationale: `A pessoa cancelou o rascunho D-${cancelled.number}.`,
      tools: [{ name: "cancelarRascunho", outcome: "ok", subject: `D-${cancelled.number}` }],
    }),
  );
  return { status: "done" as const, draft: toDraftView(cancelled), message };
}

// The draft must be the employee's and belong to their open conversation.
export async function ownWaitingDraft(
  db: Db,
  employeeId: string,
  draftId: string,
): Promise<{ status: "waiting"; row: DraftRow } | DraftOutcome> {
  const row = await findDraft(db, employeeId, draftId);
  if (!row) return { status: "not_found" };
  const open = await findOpenConversation(db, employeeId);
  if (!open || open.id !== row.conversationId) return { status: "closed" };
  if (row.status !== "pending") return answerFor(row);
  return { status: "waiting", row };
}

// A repeated request gets the outcome of the first one when there is one.
function answerFor(row: DraftRow | null): DraftOutcome {
  if (!row) return { status: "not_found" };
  if (row.status === "confirmed") return { status: "done", draft: toDraftView(row), message: null };
  if (row.status === "confirming") return { status: "in_progress" };
  return { status: "closed" };
}

// The draft's id is the idempotency key: a confirmation repeated after a timeout, or after
// an API restart, replays the first answer instead of writing twice.
function write(asEmployee: ReturnType<TicketsClient["as"]>, draft: DraftRow): Promise<Ticket> {
  const key = { idempotencyKey: draft.id };
  const fields = draft.fields as Record<string, string>;
  switch (draft.kind) {
    case "create":
      return asEmployee.create(
        {
          type: fields.type as Ticket["type"],
          title: fields.title!,
          description: fields.description!,
          category: fields.category as Ticket["category"],
          priority: fields.priority as Ticket["priority"],
          affected: fields.impact as Ticket["affected"],
        },
        key,
      );
    case "update":
      return asEmployee.addUpdate(draft.ticketNumber!, fields.message!, key);
    default:
      return asEmployee.reopen(draft.ticketNumber!, fields.reason!, key);
  }
}

async function reply(
  db: Db,
  employeeId: string,
  now: Date,
  text: string,
  decision: DecisionRecord,
  ticket?: Ticket,
): Promise<StoredMessage | null> {
  const parts: unknown[] = [{ type: "text", text }];
  if (ticket) parts.push({ type: "data-ticket", data: ticket });
  const row = await appendMessage(db, employeeId, { author: "agent", parts, decision }, now);
  return row
    ? toStoredMessage(row, {
        ...decision,
        messageId: row.id,
        conversationId: row.conversationId,
        createdAt: now,
      })
    : null;
}

function intentOf(draft: DraftRow): DecisionRecord["intent"] {
  if (draft.kind === "create") return "abrir_chamado";
  if (draft.kind === "update") return "adicionar_informacao";
  return "reabrir_chamado";
}

function decisionFor(draft: DraftRow, outcome: "ok" | "recusado", ticket?: Ticket): DecisionRecord {
  const byKind = {
    create: { action: "criou_chamado", tool: "criarChamado" },
    update: { action: "atualizou_chamado", tool: "atualizarChamado" },
    reopen: { action: "reabriu_chamado", tool: "reabrirChamado" },
  } as const;
  const kind = byKind[draft.kind as keyof typeof byKind];
  // The ticket it touched: the new one after a creation, the drafted one otherwise.
  const subject = ticket?.number ?? draft.ticketNumber ?? undefined;
  return serverDecision({
    intent: intentOf(draft),
    action: kind.action,
    rationale: `A pessoa confirmou o rascunho D-${draft.number}.`,
    tools: [{ name: kind.tool, outcome, ...(subject ? { subject } : {}) }],
  });
}

// No model judged anything: confidence is alta, every rule comes from the code that ran.
function serverDecision(
  decision: Pick<DecisionRecord, "intent" | "action" | "rationale" | "tools">,
): DecisionRecord {
  return {
    ...decision,
    confidence: "alta",
    rules: [],
    enforcedRules: enforcedRulesOf(decision.tools),
    source: "server",
    registered: true,
  };
}

function successText(draft: DraftRow, ticket: Ticket): string {
  const due = ticket.dueAt ? ` A resposta chega até ${formatDue(ticket.dueAt)}.` : "";
  if (draft.kind === "create") {
    const priority = SLA_BY_PRIORITY[ticket.priority].label;
    return `Pronto! Abri o chamado ${ticket.number}: ${ticket.title}. Prioridade ${priority}.${due}`;
  }
  if (draft.kind === "update") {
    return `Pronto! Adicionei a informação ao chamado ${ticket.number}.${due}`;
  }
  return `Pronto! Reabri o chamado ${ticket.number}.${due}`;
}

const REFUSALS: Record<string, string> = {
  ticket_closed: "ele já foi fechado",
  not_resolved: "ele não está resolvido",
  reopen_window_expired: "o prazo de 7 dias para reabrir já passou",
  not_found: "não o encontrei entre os seus chamados",
};

function refusalText(draft: DraftRow, code: string): string {
  const verb =
    draft.kind === "create" ? "criar" : draft.kind === "update" ? "atualizar" : "reabrir";
  const what = draft.ticketNumber ? `o chamado ${draft.ticketNumber}` : "o chamado";
  const why = REFUSALS[code] ?? "o sistema de chamados recusou os dados";
  return `Não consegui ${verb} ${what}: ${why}. Se quiser, posso preparar um novo rascunho.`;
}

function formatDue(iso: string): string {
  const due = new TZDate(new Date(iso).getTime(), TIME_ZONE);
  return due.toLocaleString("pt-BR", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
