import {
  MESSAGES_PER_SESSION,
  type ConversationState,
  type DecisionRecord,
  findPersonById,
  type HandoffReason,
  type MessageAuthor,
} from "@nexo/shared";
import { and, asc, desc, eq, inArray, lt, ne, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "../db/connect";
import { conversations, decisions, handoffs, messages } from "../db/schema";

// Every read and write of the stored conversations. Each function takes the employee's
// id from the session and filters by it, so another person's conversation never leaves
// the database (stage 5 PRD, S-05.13).

export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type DecisionRow = typeof decisions.$inferSelect;
export type HandoffRow = typeof handoffs.$inferSelect;

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

// "Nova conversa" (S-05.11). Closing when nothing is open is not an error.
export async function closeOpenConversation(db: Db, employeeId: string, now: Date) {
  await db
    .update(conversations)
    .set({ state: "closed", closedAt: now, updatedAt: now })
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
    { state: "closed", holderId: null, heldSince: null, closedAt: now },
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
