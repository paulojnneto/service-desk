import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const moment = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: text("employee_id").notNull(),
    state: text("state").notNull().default("with_agent"),
    // Messages sent by the employee, the 30-message limit (stage 5 PRD, S-05.9).
    employeeMessages: integer("employee_messages").notNull().default(0),
    // The analyst holding the conversation, only while "with_analyst" (stage 9 tech spec).
    holderId: text("holder_id"),
    heldSince: moment("held_since"),
    startedAt: moment("started_at").notNull(),
    updatedAt: moment("updated_at").notNull(),
    closedAt: moment("closed_at"),
  },
  (t) => [
    // At most one open conversation per employee (S-05.4).
    uniqueIndex("conversations_one_open_idx")
      .on(t.employeeId)
      .where(sql`${t.state} <> 'closed'`),
    check(
      "conversations_state_check",
      sql`${t.state} in ('with_agent', 'waiting_analyst', 'with_analyst', 'closed')`,
    ),
    check("conversations_limit_check", sql`${t.employeeMessages} between 0 and 30`),
    check(
      "conversations_holder_check",
      sql`(${t.state} = 'with_analyst') = (${t.holderId} is not null)`,
    ),
  ],
);

// Every handoff to the service desk, with the agent's summary (stage 9 PRD, S-09.1). A
// conversation can be handed off, handed back and handed off again.
export const handoffs = pgTable(
  "handoffs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    reason: text("reason").notNull(),
    summary: text("summary").notNull(),
    ticketNumber: text("ticket_number"),
    createdAt: moment("created_at").notNull(),
  },
  (t) => [
    index("handoffs_conversation_idx").on(t.conversationId, t.createdAt),
    check(
      "handoffs_reason_check",
      sql`${t.reason} in ('pedido_do_funcionario', 'caso_critico', 'chamado_vencido', 'baixa_confianca')`,
    ),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity(),
    author: text("author").notNull(),
    // The analyst who wrote it (Stage 9); null for the other authors.
    authorId: text("author_id"),
    // The id the browser gave the employee's message, so a resend is not saved twice.
    clientId: text("client_id"),
    // AI SDK UIMessage parts: exactly what the UI renders.
    parts: jsonb("parts").notNull(),
    createdAt: moment("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("messages_client_id_idx").on(t.conversationId, t.clientId),
    index("messages_order_idx").on(t.conversationId, t.seq),
    check("messages_author_check", sql`${t.author} in ('employee', 'agent', 'analyst', 'system')`),
  ],
);

// Sign-in sessions (S-05.16). The cookie holds a random id; only its SHA-256 is stored.
export const sessions = pgTable(
  "sessions",
  {
    idHash: text("id_hash").primaryKey(),
    personId: text("person_id").notNull(),
    role: text("role").notNull(),
    createdAt: moment("created_at").notNull(),
    expiresAt: moment("expires_at").notNull(),
  },
  (t) => [index("sessions_expires_idx").on(t.expiresAt)],
);

// Drafts shown as "D-381"; the numbering starts where the prototype's example does.
export const draftNumberSeq = pgSequence("draft_number_seq", { startWith: 381 });

// Every creation, update and reopening starts as a draft (stage 6 PRD, S-06.4). Only the
// confirm route turns it into a write in the ticket service.
export const drafts = pgTable(
  "drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: integer("number")
      .notNull()
      .default(sql`nextval('draft_number_seq')`),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    employeeId: text("employee_id").notNull(),
    kind: text("kind").notNull(),
    // The ticket an update or reopening is about; null for a creation.
    ticketNumber: text("ticket_number"),
    fields: jsonb("fields").notNull(),
    // Open tickets of the same category, shown before confirming (R4).
    duplicates: jsonb("duplicates").notNull().default([]),
    status: text("status").notNull().default("pending"),
    // The ticket number written when confirmed.
    resultTicket: text("result_ticket"),
    createdAt: moment("created_at").notNull(),
    decidedAt: moment("decided_at"),
  },
  (t) => [
    // At most one draft waiting per conversation (S-06.6).
    uniqueIndex("drafts_one_pending_idx")
      .on(t.conversationId)
      .where(sql`${t.status} in ('pending', 'confirming')`),
    check("drafts_kind_check", sql`${t.kind} in ('create', 'update', 'reopen')`),
    check(
      "drafts_status_check",
      sql`${t.status} in ('pending', 'confirming', 'confirmed', 'cancelled', 'superseded')`,
    ),
  ],
);

// The decision record of each agent reply (stage 6 PRD, S-06.13). Stage 8 adds the rules
// enforced by code, who decided (the agent or the server) and whether the model registered it.
export const decisions = pgTable(
  "decisions",
  {
    messageId: uuid("message_id")
      .primaryKey()
      .references(() => messages.id),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    intent: text("intent").notNull(),
    action: text("action").notNull(),
    confidence: text("confidence").notNull(),
    rationale: text("rationale").notNull(),
    rules: text("rules").array().notNull(),
    enforcedRules: text("enforced_rules")
      .array()
      .notNull()
      .default(sql`'{}'`),
    tools: jsonb("tools").notNull(),
    source: text("source").notNull().default("agent"),
    registered: boolean("registered").notNull().default(true),
    createdAt: moment("created_at").notNull(),
  },
  (t) => [
    index("decisions_conversation_idx").on(t.conversationId),
    check("decisions_confidence_check", sql`${t.confidence} in ('alta', 'media', 'baixa')`),
    check("decisions_source_check", sql`${t.source} in ('agent', 'server')`),
  ],
);
