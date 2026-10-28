import {
  MESSAGES_PER_SESSION,
  type ConversationState,
  type DecisionRecord,
  type MessageAuthor,
} from "@nexo/shared";
import { and, asc, desc, eq, lt, ne, sql } from "drizzle-orm";
import type { Db } from "../db/connect";
import { conversations, decisions, messages } from "../db/schema";

// Every read and write of the stored conversations. Each function takes the employee's
// id from the session and filters by it, so another person's conversation never leaves
// the database (stage 5 PRD, S-05.13).

export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type DecisionRow = typeof decisions.$inferSelect;

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

// Changing the state belongs to the handoff (Stage 9); tests use it to pause the agent.
export async function setConversationState(
  db: Db,
  employeeId: string,
  state: ConversationState,
  now: Date,
) {
  await db
    .update(conversations)
    .set({ state, updatedAt: now, ...(state === "closed" ? { closedAt: now } : {}) })
    .where(and(eq(conversations.employeeId, employeeId), isOpen));
}
