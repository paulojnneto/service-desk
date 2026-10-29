import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { consoleList, summarize } from "../conversations/console";
import {
  appendEmployeeMessage,
  findOpenConversation,
  lastAgentConfidences,
  lastMessages,
  latestHandoffs,
  listConsoleConversations,
} from "../conversations/repository";
import { toHandoffView } from "../conversations/to-ui";
import type { Db } from "../db/connect";
import { createTestDb, resetTestDb } from "../db/test-db";
import { isEmpty, seedConversations } from "./conversations";

let db: Db;
const now = new Date("2026-10-29T13:00:00Z");

beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  await resetTestDb(db);
});

async function list(analystId: string) {
  const rows = await listConsoleConversations(db, now);
  const ids = rows.map((row) => row.id);
  const [last, confidences, handoffs] = await Promise.all([
    lastMessages(db, ids),
    lastAgentConfidences(db, ids),
    latestHandoffs(db, ids),
  ]);
  const summaries = rows.map((row) => {
    const handoff = handoffs.get(row.id);
    return summarize({
      conversation: row,
      lastMessage: last.get(row.id) ?? null,
      lastConfidence: confidences.get(row.id) ?? null,
      handoff: handoff ? toHandoffView(handoff) : null,
    })!;
  });
  return consoleList(summaries, { filter: "todas", query: "", analystId, ticketHits: new Set() });
}

describe("seedConversations", () => {
  it("writes one conversation per state of Screen 4", async () => {
    await seedConversations(db, now);

    const { conversations, counts } = await list("rafael.lima");
    const byName = Object.fromEntries(conversations.map((s) => [s.employee.name, s]));

    expect(counts).toEqual({ para_voce: 3, com_agente: 2, minhas: 1, todas: 6 });
    expect(byName["Carla Mendes"]).toMatchObject({
      state: "waiting_analyst",
      handoff: { reason: "caso_critico", ticketNumber: "REQ-10439" },
    });
    expect(byName["Bruno Tavares"]).toMatchObject({
      state: "waiting_analyst",
      lastConfidence: "baixa",
      handoff: { reason: "baixa_confianca" },
    });
    expect(byName["Diego Ramos"]).toMatchObject({ state: "with_agent", lastConfidence: "baixa" });
    expect(byName["Gabriela Rocha"]).toMatchObject({
      state: "with_analyst",
      holder: { id: "rafael.lima" },
      lastMessage: { author: "employee", text: "A 2026, para o projeto novo." },
    });
    expect(byName["Fábio Nunes"]?.state).toBe("closed");
  });

  it("replaces only the sample conversations and leaves Ana's alone", async () => {
    await appendEmployeeMessage(db, "ana.souza", { clientId: "a1", parts: [] }, now);
    const ana = await findOpenConversation(db, "ana.souza");

    await seedConversations(db, now);
    await seedConversations(db, now);

    expect((await findOpenConversation(db, "ana.souza"))?.id).toBe(ana?.id);
    expect((await list("rafael.lima")).counts.todas).toBe(7);
  });
});

describe("isEmpty", () => {
  it("is true before the first seed and false after it", async () => {
    expect(await isEmpty(db)).toBe(true);

    await seedConversations(db, now);

    expect(await isEmpty(db)).toBe(false);
  });
});
