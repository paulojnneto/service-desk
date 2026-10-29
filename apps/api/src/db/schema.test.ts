import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_FOLDER, queryRows } from "./connect";
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

  it("mark old decisions as the server's or as unregistered (stage 8 backfill)", async () => {
    const db = await createTestDb();
    await db.execute(openConversation("ana.souza"));
    const decision = (action: string, rationale: string) => sql`
      with m as (
        insert into messages (conversation_id, author, parts, created_at)
        select id, 'agent', '[]'::jsonb, now() from conversations returning id, conversation_id
      )
      insert into decisions (message_id, conversation_id, intent, action, confidence, rationale,
                             rules, tools, created_at)
      select id, conversation_id, 'outro', ${action}, 'alta', ${rationale}, '{}', '[]', now() from m`;
    await db.execute(decision("criou_chamado", "Você confirmou o rascunho D-381."));
    await db.execute(decision("respondeu_central", "O modelo não registrou a decisão."));
    await db.execute(decision("consultou_chamados", "Pediu o status do INC-20311."));

    // The backfill statements of the migration, run again on rows written the old way.
    const migration = readFileSync(
      join(MIGRATIONS_FOLDER, "0002_decision_transparency.sql"),
      "utf8",
    );
    for (const statement of migration.split("--> statement-breakpoint")) {
      const update = statement.slice(statement.indexOf("UPDATE"));
      if (statement.includes("UPDATE")) await db.execute(sql.raw(update));
    }

    const rows = await queryRows<{ action: string; source: string; registered: boolean }>(
      db,
      sql`select action, source, registered from decisions order by action`,
    );
    expect(rows).toEqual([
      { action: "consultou_chamados", source: "agent", registered: true },
      { action: "criou_chamado", source: "server", registered: true },
      { action: "respondeu_central", source: "agent", registered: false },
    ]);
    await expect(db.execute(sql`update decisions set source = 'modelo'`)).rejects.toThrow();
  });
});
