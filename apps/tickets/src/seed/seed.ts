import { sql } from "drizzle-orm";
import type { Db } from "../db/connect";
import { articles, ticketEvents, tickets } from "../db/schema";
import { articleSearchText } from "../search-text";
import { SAMPLE_ARTICLES, sampleTickets } from "./data";

// Replaces everything with the sample data and restarts the ticket numbers.
export async function seedDatabase(db: Db, now = new Date()) {
  const sample = sampleTickets(now);
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`truncate idempotency_keys, ticket_events, tickets, articles restart identity`,
    );
    await tx.execute(sql`alter sequence inc_number_seq restart`);
    await tx.execute(sql`alter sequence req_number_seq restart`);
    await tx.insert(tickets).values(sample.tickets);
    await tx.insert(ticketEvents).values(sample.events);
    await tx
      .insert(articles)
      .values(
        SAMPLE_ARTICLES.map((article) => ({ ...article, searchText: articleSearchText(article) })),
      );
  });
  return { tickets: sample.tickets.length, articles: SAMPLE_ARTICLES.length };
}
