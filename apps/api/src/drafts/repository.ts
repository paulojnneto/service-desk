import type { DraftInput } from "@nexo/agent";
import { DraftView, type DraftStatus } from "@nexo/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/connect";
import { drafts } from "../db/schema";

// Drafts of the employee's open conversation (stage 6 PRD, S-06.4 to S-06.6). Every query
// filters by the employee, so another person's draft cannot be read, confirmed or cancelled.

export type DraftRow = typeof drafts.$inferSelect;

const WAITING: DraftStatus[] = ["pending", "confirming"];

export function toDraftView(row: DraftRow): DraftView {
  return DraftView.parse({
    id: row.id,
    number: `D-${row.number}`,
    kind: row.kind,
    status: row.status,
    ticketNumber: row.ticketNumber,
    fields: row.fields,
    duplicates: row.duplicates,
    resultTicket: row.resultTicket,
    createdAt: row.createdAt.toISOString(),
  });
}

// Stores a new draft, replacing the one waiting in the conversation (S-06.6).
export async function prepareDraft(
  db: Db,
  owner: { employeeId: string; conversationId: string },
  input: DraftInput,
  now: Date,
): Promise<DraftView> {
  return db.transaction(async (tx) => {
    await tx
      .update(drafts)
      .set({ status: "superseded", decidedAt: now })
      .where(and(eq(drafts.conversationId, owner.conversationId), eq(drafts.status, "pending")));
    const [row] = await tx
      .insert(drafts)
      .values({
        conversationId: owner.conversationId,
        employeeId: owner.employeeId,
        kind: input.kind,
        ticketNumber: input.kind === "create" ? null : input.ticketNumber,
        fields: input.fields,
        duplicates: input.kind === "create" ? input.duplicates : [],
        createdAt: now,
      })
      .returning();
    return toDraftView(row!);
  });
}

export async function findDraft(db: Db, employeeId: string, id: string) {
  const [row] = await db
    .select()
    .from(drafts)
    .where(and(eq(drafts.id, id), eq(drafts.employeeId, employeeId)));
  return row ?? null;
}

export async function findWaitingDraft(db: Db, conversationId: string) {
  const [row] = await db
    .select()
    .from(drafts)
    .where(and(eq(drafts.conversationId, conversationId), inArray(drafts.status, WAITING)));
  return row ?? null;
}

// Moves a draft from one status to another only if it is still in the expected one. The
// conditional update is what makes a double click on "Confirmar" a no-op.
export async function moveDraft(
  db: Db,
  employeeId: string,
  id: string,
  from: DraftStatus,
  to: DraftStatus,
  now: Date,
  resultTicket?: string,
) {
  const [row] = await db
    .update(drafts)
    .set({
      status: to,
      ...(to === "pending" ? { decidedAt: null } : { decidedAt: now }),
      ...(resultTicket ? { resultTicket } : {}),
    })
    .where(and(eq(drafts.id, id), eq(drafts.employeeId, employeeId), eq(drafts.status, from)))
    .returning();
  return row ?? null;
}

export async function discardWaitingDraft(db: Db, conversationId: string, now: Date) {
  const rows = await db
    .update(drafts)
    .set({ status: "cancelled", decidedAt: now })
    .where(and(eq(drafts.conversationId, conversationId), eq(drafts.status, "pending")))
    .returning({ id: drafts.id });
  return rows.length > 0;
}
