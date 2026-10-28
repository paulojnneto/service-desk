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
      expect.arrayContaining(["conversations", "decisions", "drafts", "messages", "sessions"]),
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

  it("allow one waiting draft per conversation, numbered from D-381", async () => {
    const db = await createTestDb();
    await db.execute(openConversation("ana.souza"));
    const draft = (status: string) => sql`
      insert into drafts (conversation_id, employee_id, kind, fields, status, created_at)
      select id, 'ana.souza', 'create', '{}'::jsonb, ${status}, now() from conversations`;

    await db.execute(draft("pending"));
    await expect(db.execute(draft("confirming"))).rejects.toThrow();
    await db.execute(draft("superseded"));

    const numbers = await queryRows<{ number: number }>(
      db,
      sql`select number from drafts order by number`,
    );
    expect(numbers[0]?.number).toBe(381);
  });
});
