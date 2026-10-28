import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { queryRows } from "./connect";
import { createTestDb } from "./test-db";

describe("migrations", () => {
  it("create the tables and the number sequences", async () => {
    const db = await createTestDb();

    const tables = await queryRows<{ table_name: string }>(
      db,
      sql`select table_name from information_schema.tables where table_schema = 'public'`,
    );
    expect(tables.map((row) => row.table_name)).toEqual(
      expect.arrayContaining(["articles", "idempotency_keys", "ticket_events", "tickets"]),
    );

    const [next] = await queryRows<{ inc: number; req: number }>(
      db,
      sql`select nextval('inc_number_seq')::int as inc, nextval('req_number_seq')::int as req`,
    );
    expect(next).toEqual({ inc: 20312, req: 10443 });
  });

  it("refuse an unknown status", async () => {
    const db = await createTestDb();
    const insert = db.execute(sql`
      insert into tickets (number, type, title, description, category, priority, affected,
                           status, requester_id, opened_at, last_update_at)
      values ('INC-1', 'INC', 't', 'd', 'Hardware', 'media', 'so_eu', 'perdido', 'ana.souza', now(), now())`);

    await expect(insert).rejects.toThrow();
  });
});
