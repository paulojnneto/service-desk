import {
  MESSAGES_PER_SESSION,
  type ConversationState,
  type DecisionRecord,
  findPersonById,
  type Confidence,
  type HandoffReason,
  type LastClosed,
  type MessageAuthor,
} from "@nexo/shared";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  lt,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { Db } from "../db/connect";
import { conversations, decisions, handoffs, messages } from "../db/schema";

// Every read and write of the stored conversations. Each function takes the employee's
// id from the session and filters by it, so another person's conversation never leaves
// the database (stage 5 PRD, S-05.13).

export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type DecisionRow = typeof decisions.$inferSelect;
export type HandoffRow = typeof handoffs.$inferSelect;

// The model's usage for an agent reply, stored with its decision (stage 11 PRD, S-11.1).
export type ReplyUsage = {
  model: string;
  modelCalls: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  durationMs: number;
  costUsd: number | null;
};

export type AppendResult =
  { status: "saved" | "duplicate"; conversation: ConversationRow } | { status: "limit_reached" };

const isOpen = ne(conversations.state, "closed");

export async function findOpenConversation(
  db: Db,
  employeeId: string,
): Promise<ConversationRow | null> {
  const [row] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.employeeId, employeeId), isOpen));
  return row ?? null;
}

// Any conversation by its id, for the analyst (stage 8 PRD, S-08.12). Employees never reach
// this: their routes only work on the session's own open conversation.
export async function findConversationById(
  db: Db,
  conversationId: string,
): Promise<ConversationRow | null> {
  const [row] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
  return row ?? null;
}

export async function listMessages(db: Db, conversationId: string): Promise<MessageRow[]> {
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.seq));
}

// Saves the employee's message in their open conversation, creating it on the first
// message. In one transaction: the conditional update of the counter locks the row, so
// two messages sent at once at 29 cannot both pass (S-05.9). A message whose client id
// was already saved is neither saved nor counted again (S-05.8).
export async function appendEmployeeMessage(
  db: Db,
  employeeId: string,
  message: { clientId: string; parts: unknown[] },
  now: Date,
): Promise<AppendResult> {
  return db.transaction(async (tx) => {
    // The partial unique index makes this a no-op when an open conversation exists.
    await tx
      .insert(conversations)
      .values({ employeeId, startedAt: now, updatedAt: now })
      .onConflictDoNothing();

    const [open] = await tx
      .select()
      .from(conversations)
      .where(and(eq(conversations.employeeId, employeeId), isOpen))
      .for("update");
    if (!open) throw new Error("The open conversation vanished inside its transaction.");

    const [existing] = await tx
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.conversationId, open.id), eq(messages.clientId, message.clientId)));
    if (existing) return { status: "duplicate", conversation: open };

    const [counted] = await tx
      .update(conversations)
      .set({ employeeMessages: sql`${conversations.employeeMessages} + 1`, updatedAt: now })
      .where(
        and(
          eq(conversations.id, open.id),
          lt(conversations.employeeMessages, MESSAGES_PER_SESSION),
        ),
      )
      .returning();
    if (!counted) return { status: "limit_reached" };

    await tx.insert(messages).values({
      conversationId: open.id,
      author: "employee",
      clientId: message.clientId,
      parts: message.parts,
      createdAt: now,
    });
    return { status: "saved", conversation: counted };
  });
}

// Saves a message by the agent, an analyst or the system in the employee's open conversation,
// with the agent's decision record when there is one (stage 6 PRD, S-06.13).
export async function appendMessage(
  db: Db,
  employeeId: string,
  message: {
    id?: string;
    author: Exclude<MessageAuthor, "employee">;
    authorId?: string;
    parts: unknown[];
    decision?: DecisionRecord;
    usage?: ReplyUsage;
  },
  now: Date,
): Promise<MessageRow | null> {
  return db.transaction(async (tx) => {
    const [open] = await tx
      .update(conversations)
      .set({ updatedAt: now })
      .where(and(eq(conversations.employeeId, employeeId), isOpen))
      .returning({ id: conversations.id });
    if (!open) return null;

    const [row] = await tx
      .insert(messages)
      .values({
        ...(message.id ? { id: message.id } : {}),
        conversationId: open.id,
        author: message.author,
        authorId: message.authorId ?? null,
        parts: message.parts,
        createdAt: now,
      })
      .returning();
    if (row && message.decision) {
      await tx.insert(decisions).values({
        messageId: row.id,
        conversationId: open.id,
        ...message.decision,
        ...message.usage,
        createdAt: now,
      });
    }
    return row ?? null;
  });
}

export async function listDecisions(db: Db, conversationId: string): Promise<DecisionRow[]> {
  return db.select().from(decisions).where(eq(decisions.conversationId, conversationId));
}

// The confidence of the agent's last reply, for the low-confidence rule (S-06.15).
export async function lastConfidence(db: Db, conversationId: string) {
  const [row] = await db
    .select({ confidence: decisions.confidence })
    .from(decisions)
    .where(eq(decisions.conversationId, conversationId))
    .orderBy(desc(decisions.createdAt))
    .limit(1);
  return row?.confidence as DecisionRecord["confidence"] | undefined;
}

export async function lastMessage(db: Db, conversationId: string): Promise<MessageRow | null> {
  const [row] = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.seq))
    .limit(1);
  return row ?? null;
}

// "Nova conversa" (S-05.11). Closing when nothing is open is not an error. A conversation
// with an analyst lets go of its holder too, as the analyst's close does.
export async function closeOpenConversation(db: Db, employeeId: string, now: Date) {
  await db
    .update(conversations)
    .set({
      state: "closed",
      holderId: null,
      heldSince: null,
      closedAt: now,
      closedBy: employeeId,
      updatedAt: now,
    })
    .where(and(eq(conversations.employeeId, employeeId), isOpen));
}

// Tests use it to put a conversation in a state directly; the app goes through the handoff
// and the console actions. "with_analyst" needs the analyst who holds it (stage 9).
export async function setConversationState(
  db: Db,
  employeeId: string,
  state: ConversationState,
  now: Date,
  holderId?: string,
) {
  const held = state === "with_analyst";
  await db
    .update(conversations)
    .set({
      state,
      updatedAt: now,
      holderId: held ? (holderId ?? null) : null,
      heldSince: held ? now : null,
      ...(state === "closed" ? { closedAt: now } : {}),
    })
    .where(and(eq(conversations.employeeId, employeeId), isOpen));
}

// A system note, as the employee and the analyst read it (stage 9 PRD, S-09.12).
export function noteParts(text: string): unknown[] {
  return [{ type: "text", text }];
}

// The handoff (stage 9 PRD, S-09.1): the state, the record with the agent's summary and the
// note, in one transaction, so a waiting conversation always has its summary. Only a
// conversation with the agent can be handed off; otherwise nothing changes and it answers
// false.
export async function handOffConversation(
  db: Db,
  conversationId: string,
  handoff: { reason: HandoffReason; summary: string; ticketNumber: string | null },
  now: Date,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [moved] = await tx
      .update(conversations)
      .set({ state: "waiting_analyst", updatedAt: now })
      .where(and(eq(conversations.id, conversationId), eq(conversations.state, "with_agent")))
      .returning({ id: conversations.id });
    if (!moved) return false;
    await tx.insert(handoffs).values({ conversationId, ...handoff, createdAt: now });
    await tx.insert(messages).values({
      conversationId,
      author: "system",
      parts: noteParts("Conversa transferida para o service desk."),
      createdAt: now,
    });
    return true;
  });
}

export async function listHandoffs(db: Db, conversationId: string): Promise<HandoffRow[]> {
  return db
    .select()
    .from(handoffs)
    .where(eq(handoffs.conversationId, conversationId))
    .orderBy(asc(handoffs.createdAt));
}

// --- Console actions (stage 9 PRD, S-09.7 to S-09.9) ----------------------------------------
// Each one is a single conditional UPDATE, so two analysts acting at once get one winner, and
// leaves a system note. "refused" carries the conversation as it is now, or null if unknown.

export type ConsoleActionResult =
  | { status: "done"; conversation: ConversationRow }
  | { status: "refused"; conversation: ConversationRow | null };

async function act(
  db: Db,
  conversationId: string,
  allowed: SQL | undefined,
  set: Partial<typeof conversations.$inferInsert>,
  note: string,
  now: Date,
): Promise<ConsoleActionResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(conversations)
      .set({ ...set, updatedAt: now })
      .where(and(eq(conversations.id, conversationId), allowed))
      .returning();
    if (!row) {
      const [current] = await tx
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversationId));
      return { status: "refused", conversation: current ?? null };
    }
    await tx
      .insert(messages)
      .values({ conversationId, author: "system", parts: noteParts(note), createdAt: now });
    return { status: "done", conversation: row };
  });
}

const analystName = (analystId: string) => findPersonById(analystId)?.name ?? "Um analista";

// Held by this analyst, or waiting for anyone (decision 3).
const heldByOrWaiting = (analystId: string) =>
  or(
    and(eq(conversations.state, "with_analyst"), eq(conversations.holderId, analystId)),
    eq(conversations.state, "waiting_analyst"),
  );

// From waiting, or straight from the agent (decision 4). The agent stays paused.
export function takeOver(db: Db, conversationId: string, analystId: string, now: Date) {
  return act(
    db,
    conversationId,
    inArray(conversations.state, ["waiting_analyst", "with_agent"]),
    { state: "with_analyst", holderId: analystId, heldSince: now },
    `${analystName(analystId)} assumiu o atendimento.`,
    now,
  );
}

export function handBack(db: Db, conversationId: string, analystId: string, now: Date) {
  return act(
    db,
    conversationId,
    heldByOrWaiting(analystId),
    { state: "with_agent", holderId: null, heldSince: null },
    "Conversa devolvida ao Nexo Assist.",
    now,
  );
}

export function closeByAnalyst(db: Db, conversationId: string, analystId: string, now: Date) {
  return act(
    db,
    conversationId,
    heldByOrWaiting(analystId),
    { state: "closed", holderId: null, heldSince: null, closedAt: now, closedBy: analystId },
    "Atendimento encerrado.",
    now,
  );
}

// The holder's reply (S-09.8). It does not count toward the employee's limit, and a resend
// with the same client id returns the message already saved.
export async function appendAnalystMessage(
  db: Db,
  conversationId: string,
  analystId: string,
  message: { clientId: string; text: string },
  now: Date,
): Promise<
  { status: "saved"; message: MessageRow } | (ConsoleActionResult & { status: "refused" })
> {
  return db.transaction(async (tx) => {
    const [held] = await tx
      .update(conversations)
      .set({ updatedAt: now })
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.state, "with_analyst"),
          eq(conversations.holderId, analystId),
        ),
      )
      .returning({ id: conversations.id });
    if (!held) {
      const [current] = await tx
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversationId));
      return { status: "refused", conversation: current ?? null };
    }
    const [existing] = await tx
      .select()
      .from(messages)
      .where(
        and(eq(messages.conversationId, conversationId), eq(messages.clientId, message.clientId)),
      );
    if (existing) return { status: "saved", message: existing };
    const [row] = await tx
      .insert(messages)
      .values({
        conversationId,
        author: "analyst",
        authorId: analystId,
        clientId: message.clientId,
        parts: [{ type: "text", text: message.text }],
        createdAt: now,
      })
      .returning();
    return { status: "saved", message: row! };
  });
}

// What the limits count since `since` (stage 11 PRD, S-11.6 and S-11.7): this employee's agent
// turns and the estimated cost of every agent turn. Server replies do not count.
export async function usageSince(db: Db, employeeId: string, since: Date) {
  const [row] = await db
    .select({
      employeeTurns:
        sql<number>`count(*) filter (where ${conversations.employeeId} = ${employeeId})`.mapWith(
          Number,
        ),
      costUsd: sql<number>`coalesce(sum(${decisions.costUsd}), 0)`.mapWith(Number),
    })
    .from(decisions)
    .innerJoin(conversations, eq(conversations.id, decisions.conversationId))
    .where(and(eq(decisions.source, "agent"), gte(decisions.createdAt, since)));
  return { employeeTurns: row?.employeeTurns ?? 0, costUsd: row?.costUsd ?? 0 };
}

// --- Console reads (stage 9 PRD, S-09.3, S-09.4 and S-09.12) ---------------------------------

// Closed conversations stay in "Todas" for a few days (decision 8).
const CLOSED_VISIBLE_DAYS = 7;

export async function listConsoleConversations(db: Db, now: Date): Promise<ConversationRow[]> {
  const since = new Date(now.getTime() - CLOSED_VISIBLE_DAYS * 24 * 60 * 60 * 1000);
  return db
    .select()
    .from(conversations)
    .where(or(isOpen, gte(conversations.closedAt, since)))
    .orderBy(desc(conversations.updatedAt));
}

// The last thing a person or the agent said; system notes are not a preview.
export async function lastMessages(db: Db, ids: string[]): Promise<Map<string, MessageRow>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .selectDistinctOn([messages.conversationId])
    .from(messages)
    .where(and(inArray(messages.conversationId, ids), ne(messages.author, "system")))
    .orderBy(messages.conversationId, desc(messages.seq));
  return new Map(rows.map((row) => [row.conversationId, row]));
}

// The confidence of each conversation's latest agent decision (A2).
export async function lastAgentConfidences(
  db: Db,
  ids: string[],
): Promise<Map<string, Confidence>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .selectDistinctOn([decisions.conversationId], {
      conversationId: decisions.conversationId,
      confidence: decisions.confidence,
    })
    .from(decisions)
    .where(and(inArray(decisions.conversationId, ids), eq(decisions.source, "agent")))
    .orderBy(decisions.conversationId, desc(decisions.createdAt));
  return new Map(rows.map((row) => [row.conversationId, row.confidence as Confidence]));
}

export async function latestHandoffs(db: Db, ids: string[]): Promise<Map<string, HandoffRow>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .selectDistinctOn([handoffs.conversationId])
    .from(handoffs)
    .where(inArray(handoffs.conversationId, ids))
    .orderBy(handoffs.conversationId, desc(handoffs.createdAt));
  return new Map(rows.map((row) => [row.conversationId, row]));
}

// Conversations that mention a ticket number, in a handoff or in any message. The caller
// passes only a ticket number ("INC-20311"), so it has no LIKE wildcards to escape.
export async function conversationsMentioning(
  db: Db,
  ids: string[],
  ticketNumber: string,
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const pattern = `%${ticketNumber}%`;
  const [inMessages, inHandoffs] = await Promise.all([
    db
      .selectDistinct({ id: messages.conversationId })
      .from(messages)
      .where(
        and(inArray(messages.conversationId, ids), ilike(sql`${messages.parts}::text`, pattern)),
      ),
    db
      .selectDistinct({ id: handoffs.conversationId })
      .from(handoffs)
      .where(and(inArray(handoffs.conversationId, ids), ilike(handoffs.ticketNumber, pattern))),
  ]);
  return new Set([...inMessages, ...inHandoffs].map((row) => row.id));
}

// What was stored after a message, in order; optionally only from some authors.
export async function messagesAfter(
  db: Db,
  conversationId: string,
  after: number,
  authors?: MessageAuthor[],
): Promise<MessageRow[]> {
  return db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        gt(messages.seq, after),
        authors ? inArray(messages.author, authors) : undefined,
      ),
    )
    .orderBy(asc(messages.seq));
}

// The employee's latest conversation, open or just closed by an analyst, so the chat on screen
// learns that it was closed (stage 9 tech spec).
export async function findLatestConversation(
  db: Db,
  employeeId: string,
): Promise<ConversationRow | null> {
  const [row] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.employeeId, employeeId))
    .orderBy(desc(conversations.startedAt))
    .limit(1);
  return row ?? null;
}

// Who closed the employee's latest conversation and when, if it was an analyst: closing it
// with "Nova conversa" needs no reminder.
export async function lastClosedByAnalyst(db: Db, employeeId: string): Promise<LastClosed | null> {
  const latest = await findLatestConversation(db, employeeId);
  if (latest?.state !== "closed" || !latest.closedBy || !latest.closedAt) return null;
  if (latest.closedBy === employeeId) return null;
  return {
    by: findPersonById(latest.closedBy)?.name ?? "Um analista",
    at: latest.closedAt.toISOString(),
  };
}
