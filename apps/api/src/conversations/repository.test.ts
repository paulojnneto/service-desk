import { MESSAGES_PER_SESSION } from "@nexo/shared";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db/connect";
import { createTestDb, resetTestDb } from "../db/test-db";
import {
  appendEmployeeMessage,
  appendMessage,
  closeOpenConversation,
  findOpenConversation,
  listMessages,
} from "./repository";
import { toAgentHistory, toConversationView } from "./to-ui";

let db: Db;
const now = new Date("2026-10-28T12:00:00Z");
const text = (value: string) => [{ type: "text", text: value }];

beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  await resetTestDb(db);
});

function send(employeeId: string, clientId: string, value = "oi") {
  return appendEmployeeMessage(db, employeeId, { clientId, parts: text(value) }, now);
}

describe("appendEmployeeMessage", () => {
  it("creates the conversation on the first message and counts it", async () => {
    expect(await findOpenConversation(db, "ana.souza")).toBeNull();

    const result = await send("ana.souza", "c1");

    expect(result.status).toBe("saved");
    const open = await findOpenConversation(db, "ana.souza");
    expect(open).toMatchObject({ state: "with_agent", employeeMessages: 1 });
  });

  it("does not save or count a message whose client id was already saved", async () => {
    await send("ana.souza", "c1");
    const again = await send("ana.souza", "c1");

    expect(again.status).toBe("duplicate");
    const open = await findOpenConversation(db, "ana.souza");
    expect(open?.employeeMessages).toBe(1);
    expect(await listMessages(db, open!.id)).toHaveLength(1);
  });

  it("refuses the 31st message", async () => {
    for (let i = 1; i <= MESSAGES_PER_SESSION; i++) {
      expect((await send("ana.souza", `c${i}`)).status).toBe("saved");
    }

    expect((await send("ana.souza", "c31")).status).toBe("limit_reached");
    const open = await findOpenConversation(db, "ana.souza");
    expect(open?.employeeMessages).toBe(MESSAGES_PER_SESSION);
    expect(await listMessages(db, open!.id)).toHaveLength(MESSAGES_PER_SESSION);
  });

  it("lets only one of two messages sent at once at 29 through", async () => {
    for (let i = 1; i < MESSAGES_PER_SESSION; i++) await send("ana.souza", `c${i}`);

    const results = await Promise.all([send("ana.souza", "a"), send("ana.souza", "b")]);

    expect(results.map((r) => r.status).sort()).toEqual(["limit_reached", "saved"]);
  });

  it("keeps each employee's conversation separate", async () => {
    await send("ana.souza", "c1", "da Ana");
    await send("bruno.tavares", "c1", "do Bruno");

    const bruno = await findOpenConversation(db, "bruno.tavares");
    const rows = await listMessages(db, bruno!.id);
    expect(rows.map((r) => r.parts)).toEqual([text("do Bruno")]);
  });

  it("starts a new conversation, with the count at 0, after closing", async () => {
    await send("ana.souza", "c1");
    const first = await findOpenConversation(db, "ana.souza");

    await closeOpenConversation(db, "ana.souza", now);
    expect(await findOpenConversation(db, "ana.souza")).toBeNull();

    await send("ana.souza", "c1");
    const second = await findOpenConversation(db, "ana.souza");
    expect(second?.id).not.toBe(first?.id);
    expect(second?.employeeMessages).toBe(1);
  });
});

describe("history", () => {
  it("comes back in order with authors, and the agent reads only employee and agent messages", async () => {
    await send("ana.souza", "c1", "pergunta");
    await appendMessage(db, "ana.souza", { author: "agent", parts: text("resposta") }, now);
    await appendMessage(
      db,
      "ana.souza",
      { author: "analyst", authorId: "rafael.lima", parts: text("assumi") },
      now,
    );
    await appendMessage(db, "ana.souza", { author: "system", parts: text("transferida") }, now);

    const open = await findOpenConversation(db, "ana.souza");
    const rows = await listMessages(db, open!.id);
    const view = toConversationView(open!, rows);

    expect(view.messages.map((m) => [m.role, m.metadata.author])).toEqual([
      ["user", "employee"],
      ["assistant", "agent"],
      ["assistant", "analyst"],
      ["assistant", "system"],
    ]);
    expect(view.messages[2]?.metadata.authorName).toBe("Rafael Lima");
    expect(toAgentHistory(rows).map((m) => m.parts)).toEqual([text("pergunta"), text("resposta")]);
  });

  it("does not append to a conversation that is not open", async () => {
    expect(await appendMessage(db, "ana.souza", { author: "agent", parts: text("x") }, now)).toBe(
      null,
    );
  });
});
