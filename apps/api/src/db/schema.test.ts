import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { queryRows } from "./connect";
import { createTestDb } from "./test-db";

function openConversation(employeeId: string, state = "with_agent") {
  return sql`insert into conversations (employee_id, state, started_at, updated_at)
             values (${employeeId}, ${state}, now(), now())`;
}

describe("migrations", () => {
  it("create the conversation and session tables", async () => {
    const db = await createTestDb();

    const tables = await queryRows<{ table_name: string }>(
      db,
      sql`select table_name from information_schema.tables where table_schema = 'public'`,
    );
    expect(tables.map((row) => row.table_name)).toEqual(
      expect.arrayContaining(["conversations", "messages", "sessions"]),
    );
  });

  it("allow one open conversation per employee, and a new one after closing", async () => {
    const db = await createTestDb();
    await db.execute(openConversation("ana.souza"));

    await expect(db.execute(openConversation("ana.souza", "waiting_analyst"))).rejects.toThrow();
    await db.execute(openConversation("bruno.tavares"));

    await db.execute(
      sql`update conversations set state = 'closed' where employee_id = 'ana.souza'`,
    );
    await db.execute(openConversation("ana.souza"));
  });

  it("refuse an unknown state and a count above the limit", async () => {
    const db = await createTestDb();

    await expect(db.execute(openConversation("ana.souza", "paused"))).rejects.toThrow();
    await db.execute(openConversation("ana.souza"));
    await expect(
      db.execute(sql`update conversations set employee_messages = 31`),
    ).rejects.toThrow();
  });
});
