import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// One sequence per type, continuing after the highest numbers in the sample data.
export const incNumberSeq = pgSequence("inc_number_seq", { startWith: 20312 });
export const reqNumberSeq = pgSequence("req_number_seq", { startWith: 10443 });

const moment = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const tickets = pgTable(
  "tickets",
  {
    number: text("number").primaryKey(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    priority: text("priority").notNull(),
    affected: text("affected").notNull(),
    status: text("status").notNull(),
    requesterId: text("requester_id").notNull(),
    openedAt: moment("opened_at").notNull(),
    lastUpdateAt: moment("last_update_at").notNull(),
    resolvedAt: moment("resolved_at"),
  },
  (t) => [
    index("tickets_requester_idx").on(t.requesterId, t.lastUpdateAt),
    check("tickets_type_check", sql`${t.type} in ('INC', 'REQ')`),
    check(
      "tickets_status_check",
      sql`${t.status} in ('aguardando_analista', 'em_andamento', 'aprovado', 'resolvido', 'fechado')`,
    ),
  ],
);

export const ticketEvents = pgTable(
  "ticket_events",
  {
    id: serial("id").primaryKey(),
    ticketNumber: text("ticket_number")
      .notNull()
      .references(() => tickets.number, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    at: moment("at").notNull(),
    authorId: text("author_id").notNull(),
    message: text("message"),
  },
  (t) => [index("ticket_events_ticket_idx").on(t.ticketNumber, t.at)],
);

// Help center. search_text is the title and body without accents, for full-text search.
export const articles = pgTable("articles", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  searchText: text("search_text").notNull(),
});

// First response to each write, so a retried request replays it instead of acting twice.
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    requesterId: text("requester_id").notNull(),
    key: text("key").notNull(),
    status: integer("status").notNull(),
    body: jsonb("body").notNull(),
    createdAt: moment("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.requesterId, t.key] })],
);
