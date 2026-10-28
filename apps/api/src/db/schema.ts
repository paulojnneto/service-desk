import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
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
