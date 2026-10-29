import { describe, expect, it } from "vitest";
import { consoleList, summarize, type SummaryInput } from "./console";
import type { ConversationRow, MessageRow } from "./repository";

let seq = 0;

function conversation(
  employeeId: string,
  state: string,
  extra: Partial<ConversationRow> = {},
): ConversationRow {
  const at = new Date(Date.UTC(2026, 9, 29, 10, seq++));
  return {
    id: `c-${employeeId}`,
    employeeId,
    state,
    employeeMessages: 1,
    holderId: null,
    heldSince: null,
    startedAt: at,
    updatedAt: at,
    closedAt: null,
    ...extra,
  };
}

function message(text: string, author = "employee"): MessageRow {
  return {
    id: `m-${seq++}`,
    conversationId: "c",
    seq,
    author,
    authorId: null,
    clientId: null,
    parts: [{ type: "text", text }],
    createdAt: new Date("2026-10-29T10:05:00Z"),
  };
}

const handoff = {
  reason: "chamado_vencido",
  summary: "INC-20311 vencido.",
  ticketNumber: "INC-20311",
  at: "2026-10-29T10:05:00Z",
} as const;

function input(row: ConversationRow, extra: Partial<SummaryInput> = {}): SummaryInput {
  return { conversation: row, lastMessage: null, lastConfidence: null, handoff: null, ...extra };
}

describe("summarize", () => {
  it("shows the person, the holder, a short last message and the handoff while waiting", () => {
    const summary = summarize(
      input(conversation("ana.souza", "waiting_analyst"), {
        lastMessage: message(`Quero   falar com um analista. ${"x".repeat(200)}`),
        handoff,
      }),
    );

    expect(summary).toMatchObject({
      employee: { name: "Ana Souza", initials: "AS" },
      state: "waiting_analyst",
      holder: null,
      handoff,
    });
    expect(summary?.lastMessage?.text).toMatch(/^Quero falar com um analista\. x+$/);
    expect(summary?.lastMessage?.text).toHaveLength(140);
  });

  it("drops the handoff once the conversation is back with the agent, and skips non-employees", () => {
    expect(summarize(input(conversation("ana.souza", "with_agent"), { handoff }))?.handoff).toBe(
      null,
    );
    expect(summarize(input(conversation("rafael.lima", "with_agent")))).toBeNull();
  });
});

describe("consoleList", () => {
  const rows = [
    summarize(input(conversation("bruno.tavares", "with_agent"), { lastConfidence: "baixa" })),
    summarize(input(conversation("diego.ramos", "with_agent"), { lastConfidence: "alta" })),
    summarize(input(conversation("ana.souza", "waiting_analyst"), { handoff })),
    summarize(
      input(conversation("carla.mendes", "with_analyst", { holderId: "rafael.lima" }), {
        handoff,
      }),
    ),
    summarize(input(conversation("fabio.nunes", "closed"))),
  ].map((s) => s!);
  const options = { query: "", analystId: "rafael.lima", ticketHits: new Set<string>() };

  it("puts waiting and low-confidence conversations in 'Para você', waiting first", () => {
    const list = consoleList(rows, { ...options, filter: "para_voce" });

    expect(list.conversations.map((s) => s.employee.name)).toEqual(["Ana Souza", "Bruno Tavares"]);
    expect(list.counts).toEqual({ para_voce: 2, com_agente: 2, minhas: 1, todas: 5 });
  });

  it("filters by holder and by state", () => {
    expect(
      consoleList(rows, { ...options, filter: "minhas" }).conversations.map((s) => s.employee.name),
    ).toEqual(["Carla Mendes"]);
    expect(
      consoleList(rows, { ...options, analystId: "julia.castro", filter: "minhas" }).conversations,
    ).toEqual([]);
  });

  it("searches names without accents and ticket numbers found in the conversation", () => {
    const byName = consoleList(rows, { ...options, filter: "todas", query: "FABIO" });
    expect(byName.conversations.map((s) => s.employee.name)).toEqual(["Fábio Nunes"]);
    expect(byName.counts.todas).toBe(1);

    const byTicket = consoleList(rows, {
      ...options,
      filter: "todas",
      query: "INC-20305",
      ticketHits: new Set(["c-bruno.tavares"]),
    });
    expect(byTicket.conversations.map((s) => s.employee.name)).toEqual(["Bruno Tavares"]);
  });
});
