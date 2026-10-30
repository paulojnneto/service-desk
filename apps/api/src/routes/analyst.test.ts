import type {
  AnalystConversationView,
  ConsoleList,
  ConsoleTickets,
  ConversationUpdates,
  ConversationView,
  StoredMessage,
} from "@nexo/shared";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  findConversationById,
  findOpenConversation,
  handOffConversation,
} from "../conversations/repository";
import type { Db } from "../db/connect";
import { createTestApp, postJson, signIn, testTickets } from "../test-app";

// The tests run without NEXO_AGENT_MODEL, so the agent uses the simulated model.
let app: Awaited<ReturnType<typeof createTestApp>>["app"];
let db: Db;

beforeEach(async () => {
  ({ app, db } = await createTestApp());
});

type Body = Record<string, unknown>;

async function get(path: string, cookie?: string) {
  const res = await app.request(path, { headers: cookie ? { cookie } : {} });
  return { status: res.status, body: (await res.json()) as Body };
}

async function post(path: string, cookie: string, body: unknown = {}) {
  const res = await postJson(app, path, body, cookie);
  return { status: res.status, body: (await res.json()) as Body };
}

async function current(cookie: string) {
  return (await get("/api/conversations/current", cookie)).body.conversation as ConversationView;
}

// Ana sends a message; resolves once the stored history has the expected length.
async function anaSays(cookie: string, text: string, length: number) {
  const res = await postJson(
    app,
    "/api/chat",
    { message: { id: crypto.randomUUID(), parts: [{ type: "text", text }] } },
    cookie,
  );
  await res.text();
  for (let i = 0; i < 50; i++) {
    const conversation = await current(cookie);
    if (conversation.messages.length >= length) return conversation;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return current(cookie);
}

async function anaConversation() {
  const { cookie } = await signIn(app, "ana.souza@nexo.com.br");
  const employee = await anaSays(cookie, "Qual o horário do service desk?", 2);
  return { cookie, employee };
}

// Ana's conversation, handed off by the agent with a summary.
async function waitingConversation() {
  const ana = await anaConversation();
  await handOffConversation(
    db,
    ana.employee.id,
    { reason: "pedido_do_funcionario", summary: "Ana pediu um analista.", ticketNumber: null },
    new Date(),
  );
  const rafael = (await signIn(app, "rafael.lima@nexo.com.br")).cookie;
  const julia = (await signIn(app, "julia.castro@nexo.com.br")).cookie;
  return { ...ana, id: ana.employee.id, rafael, julia };
}

const path = (id: string, action = "") => `/api/analyst/conversations/${id}${action}`;
const textOf = (message: StoredMessage | undefined) =>
  (message?.parts[0] as { text?: string } | undefined)?.text;

describe("GET /api/analyst/conversations/:id", () => {
  it("returns any conversation with the employee's records, the employee and the handoffs", async () => {
    const { employee, id, rafael } = await waitingConversation();

    const { status, body } = await get(path(id), rafael);
    const view = body.conversation as AnalystConversationView;

    expect(status).toBe(200);
    expect(view.messages.slice(0, 2)).toEqual(employee.messages);
    expect(view.messages.at(-1)?.metadata.decision).toBeUndefined();
    expect(view).toMatchObject({
      state: "waiting_analyst",
      holder: null,
      employee: { id: "ana.souza", name: "Ana Souza", department: "Financeiro", initials: "AS" },
      handoffs: [
        { reason: "pedido_do_funcionario", summary: "Ana pediu um analista.", ticketNumber: null },
      ],
    });
  });

  it("refuses employees, even for their own conversation", async () => {
    const { cookie } = await anaConversation();
    const open = await findOpenConversation(db, "ana.souza");

    expect((await get(path(open!.id), cookie)).status).toBe(403);
    expect((await get(path(open!.id))).status).toBe(401);
    for (const action of ["/take-over", "/hand-back", "/close", "/messages"]) {
      expect((await post(path(open!.id, action), cookie)).status).toBe(403);
    }
  });

  it("answers 400 to a malformed id and 404 to an unknown one", async () => {
    const rafael = await signIn(app, "rafael.lima@nexo.com.br");

    expect(await get("/api/analyst/conversations/abc", rafael.cookie)).toEqual({
      status: 400,
      body: { error: "invalid_id" },
    });
    expect(await get(path(crypto.randomUUID()), rafael.cookie)).toEqual({
      status: 404,
      body: { error: "not_found" },
    });
  });
});

describe("POST take-over", () => {
  it("takes a waiting conversation, pauses the agent and tells the employee", async () => {
    const { cookie, id, rafael } = await waitingConversation();

    const { status, body } = await post(path(id, "/take-over"), rafael);

    expect(status).toBe(200);
    expect(body.conversation).toMatchObject({
      state: "with_analyst",
      holder: { id: "rafael.lima", name: "Rafael Lima", level: "Suporte N2" },
    });
    const ana = await current(cookie);
    expect(textOf(ana.messages.at(-1))).toBe("Rafael Lima assumiu o atendimento.");
    expect(ana.holder).toMatchObject({ name: "Rafael Lima" });

    // The agent stays quiet (S-09.10): the message is saved, no reply follows.
    const after = await anaSays(cookie, "Está parado há 5 dias.", 99);
    expect(after.messages.at(-1)?.metadata.author).toBe("employee");
  });

  it("takes a conversation still with the agent (decision 4)", async () => {
    const { employee } = await anaConversation();
    const rafael = (await signIn(app, "rafael.lima@nexo.com.br")).cookie;

    expect((await post(path(employee.id, "/take-over"), rafael)).body.conversation).toMatchObject({
      state: "with_analyst",
    });
  });

  it("gives one winner when two analysts take over at once", async () => {
    const { id, rafael, julia } = await waitingConversation();

    const results = await Promise.all([
      post(path(id, "/take-over"), rafael),
      post(path(id, "/take-over"), julia),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const lost = results.find((r) => r.status === 409)!;
    const winner = (await findConversationById(db, id))!.holderId;
    expect(lost.body).toMatchObject({ error: "already_held", holder: { id: winner } });
    // Taking over again what one already holds is harmless.
    const again = await post(path(id, "/take-over"), winner === "rafael.lima" ? rafael : julia);
    expect(again.status).toBe(200);
  });
});

describe("POST messages", () => {
  it("lets only the holder reply, outside the employee's limit, once per client id", async () => {
    const { cookie, id, rafael, julia } = await waitingConversation();
    await post(path(id, "/take-over"), rafael);
    const before = await findConversationById(db, id);
    const reply = { clientId: "r1", text: "Oi, Ana! Aqui é o Rafael." };

    const first = await post(path(id, "/messages"), rafael, reply);
    const resend = await post(path(id, "/messages"), rafael, reply);

    expect(first.status).toBe(200);
    expect(first.body.message).toMatchObject({
      role: "assistant",
      metadata: { author: "analyst", authorName: "Rafael Lima", authorLevel: "Suporte N2" },
    });
    expect((resend.body.message as StoredMessage).id).toBe(
      (first.body.message as StoredMessage).id,
    );
    expect((await findConversationById(db, id))?.employeeMessages).toBe(before?.employeeMessages);
    expect(textOf((await current(cookie)).messages.at(-1))).toBe("Oi, Ana! Aqui é o Rafael.");

    expect(await post(path(id, "/messages"), julia, { clientId: "j1", text: "Oi" })).toMatchObject({
      status: 409,
      body: { error: "not_holder", holder: { id: "rafael.lima" } },
    });
    expect((await post(path(id, "/messages"), rafael, { clientId: "r2", text: " " })).status).toBe(
      400,
    );
  });
});

describe("POST hand-back and close", () => {
  it("hands back only by the holder, and the agent answers again", async () => {
    const { cookie, id, rafael, julia } = await waitingConversation();
    await post(path(id, "/take-over"), rafael);

    expect((await post(path(id, "/hand-back"), julia)).status).toBe(409);
    expect((await post(path(id, "/hand-back"), rafael)).body.conversation).toMatchObject({
      state: "with_agent",
      holder: null,
    });

    const length = (await current(cookie)).messages.length;
    const ana = await anaSays(cookie, "Qual o horário do service desk?", length + 2);
    expect(ana.messages.at(-1)?.metadata.author).toBe("agent");
    expect(ana.messages.some((m) => textOf(m) === "Conversa devolvida ao Nexo Assist.")).toBe(true);
  });

  it("lets any analyst close a waiting conversation, which then takes nothing more", async () => {
    const { cookie, id, rafael, julia } = await waitingConversation();

    const closed = await post(path(id, "/close"), julia);
    expect(closed.body.conversation).toMatchObject({ state: "closed" });
    expect(textOf((closed.body.conversation as ConversationView).messages.at(-1))).toBe(
      "Atendimento encerrado.",
    );
    expect(await post(path(id, "/take-over"), rafael)).toMatchObject({
      status: 409,
      body: { error: "closed" },
    });

    // The employee's next message starts a new conversation (S-09.9).
    const next = await anaSays(cookie, "Qual o horário do service desk?", 2);
    expect(next.id).not.toBe(id);
  });
});

describe("GET /api/analyst/conversations", () => {
  it("lists by filter with counts, waiting first, and finds by name or ticket number", async () => {
    const { id, rafael } = await waitingConversation();
    // Bruno talks to the agent; his reply is stored as a low-confidence one ("blá").
    const bruno = (await signIn(app, "bruno.tavares@nexo.com.br")).cookie;
    await anaSays(bruno, "blá", 2);
    await db.execute(sql`update handoffs set ticket_number = 'INC-20311'`);

    const list = (await get("/api/analyst/conversations?filter=para_voce", rafael))
      .body as unknown as ConsoleList;
    expect(list.conversations.map((s) => [s.employee.name, s.state, s.lastConfidence])).toEqual([
      ["Ana Souza", "waiting_analyst", "alta"],
      ["Bruno Tavares", "with_agent", "baixa"],
    ]);
    expect(list.conversations[0]?.handoff).toMatchObject({ ticketNumber: "INC-20311" });
    expect(list.counts).toEqual({ para_voce: 2, com_agente: 1, minhas: 0, todas: 2 });

    const search = async (q: string) =>
      (
        (await get(`/api/analyst/conversations?filter=todas&q=${q}`, rafael)).body as ConsoleList
      ).conversations.map((s) => s.id);
    expect(await search("bruno")).toHaveLength(1);
    expect(await search("inc-20311")).toEqual([id]);
  });

  it("shows closed conversations only in 'Todas', and only for 7 days", async () => {
    const { id, julia } = await waitingConversation();
    await post(path(id, "/close"), julia);
    const todas = async () =>
      ((await get("/api/analyst/conversations?filter=todas", julia)).body as ConsoleList)
        .conversations;

    expect((await todas()).map((s) => s.state)).toEqual(["closed"]);
    await db.execute(sql`update conversations set closed_at = now() - interval '8 days'`);
    expect(await todas()).toEqual([]);
  });
});

describe("updates", () => {
  it("gives the analyst every message after a seq, with the state and the holder", async () => {
    const { cookie, id, rafael } = await waitingConversation();
    const seq = (await current(cookie)).messages.at(-1)!.metadata.seq!;
    await post(path(id, "/take-over"), rafael);
    await anaSays(cookie, "Está parado há 5 dias.", 99);

    const updates = (await get(path(id, `/updates?after=${seq}`), rafael))
      .body as unknown as ConversationUpdates;

    expect(updates).toMatchObject({ state: "with_analyst", holder: { id: "rafael.lima" } });
    expect(updates.messages.map((m) => m.metadata.author)).toEqual(["system", "employee"]);
  });

  it("gives the employee only the analysts' and the system's messages, also after a close", async () => {
    const { cookie, id, rafael } = await waitingConversation();
    await post(path(id, "/take-over"), rafael);
    await post(path(id, "/messages"), rafael, { clientId: "r1", text: "Oi, Ana!" });
    await anaSays(cookie, "Oi!", 99);
    await post(path(id, "/close"), rafael);

    const { body } = await get("/api/conversations/current/updates?after=0", cookie);
    const updates = body as unknown as ConversationUpdates;

    expect(updates.state).toBe("closed");
    expect(updates.messages.map((m) => [m.metadata.author, textOf(m)])).toEqual([
      ["system", "Conversa transferida para o service desk."],
      ["system", "Rafael Lima assumiu o atendimento."],
      ["analyst", "Oi, Ana!"],
      ["system", "Atendimento encerrado."],
    ]);
  });

  it("tells the employee's next chat who closed the last conversation", async () => {
    const { cookie, id, rafael } = await waitingConversation();
    await post(path(id, "/take-over"), rafael);
    await post(path(id, "/close"), rafael);

    const { body } = await get("/api/conversations/current", cookie);

    expect(body).toMatchObject({
      conversation: null,
      lastClosed: { by: "Rafael Lima", at: expect.any(String) },
    });
  });
});

describe("POST take-over, the related ticket", () => {
  it("moves the handoff's ticket to em andamento", async () => {
    const { id, rafael } = await waitingConversation();
    await db.execute(sql`update handoffs set ticket_number = 'INC-20311'`);
    const service = await testTickets();
    try {
      await post(path(id, "/take-over"), rafael);

      const tickets = (await get(path(id, "/tickets"), rafael)).body as unknown as ConsoleTickets;
      expect(tickets.related).toMatchObject({ number: "INC-20311", status: "em_andamento" });
      const ticket = await service.client.as("ana.souza").get("INC-20311");
      expect(ticket.events?.at(-1)?.message).toBe("Assumido por Rafael Lima");
    } finally {
      await service.reseed();
    }
  });

  it("moves a ticket a confirmed draft wrote in the conversation, with no ticket in the handoff", async () => {
    const { id, rafael } = await waitingConversation();
    await db.execute(sql`
      insert into drafts (conversation_id, employee_id, kind, ticket_number, fields, status,
        result_ticket, created_at, decided_at)
      values (${id}, 'ana.souza', 'update', 'INC-20311', '{}', 'confirmed', 'INC-20311', now(), now())`);
    const service = await testTickets();
    try {
      await post(path(id, "/take-over"), rafael);

      const tickets = (await get(path(id, "/tickets"), rafael)).body as unknown as ConsoleTickets;
      expect(tickets.related).toMatchObject({ number: "INC-20311", status: "em_andamento" });
    } finally {
      await service.reseed();
    }
  });

  it("puts the ticket back to aguardando analista on a hand back", async () => {
    const { id, rafael } = await waitingConversation();
    await db.execute(sql`update handoffs set ticket_number = 'INC-20311'`);
    const service = await testTickets();
    try {
      await post(path(id, "/take-over"), rafael);
      await post(path(id, "/hand-back"), rafael);

      const tickets = (await get(path(id, "/tickets"), rafael)).body as unknown as ConsoleTickets;
      expect(tickets.related).toMatchObject({ number: "INC-20311", status: "aguardando_analista" });
    } finally {
      await service.reseed();
    }
  });

  it("still takes the conversation over when the ticket service is down", async () => {
    const { id, rafael } = await waitingConversation();
    await db.execute(sql`update handoffs set ticket_number = 'INC-20311'`);
    const service = await testTickets();
    service.down.value = true;
    try {
      const { status, body } = await post(path(id, "/take-over"), rafael);
      expect(status).toBe(200);
      expect(body.conversation).toMatchObject({ state: "with_analyst" });
    } finally {
      service.down.value = false;
    }
  });
});

describe("GET /api/analyst/conversations/:id/tickets", () => {
  it("reads the conversation's employee's tickets, the related one first", async () => {
    const { id, rafael } = await waitingConversation();
    await db.execute(sql`update handoffs set ticket_number = 'INC-20311'`);

    const { status, body } = await get(path(id, "/tickets"), rafael);
    const tickets = body as unknown as ConsoleTickets;

    expect(status).toBe(200);
    expect(tickets.related?.number).toBe("INC-20311");
    expect(tickets.others.map((t) => t.number)).not.toContain("INC-20311");
    expect(tickets.others.every((t) => t.requesterId === "ana.souza")).toBe(true);
  });

  it("answers 503 when the ticket service is down", async () => {
    const { id, rafael } = await waitingConversation();
    const service = await testTickets();
    service.down.value = true;
    try {
      expect((await get(path(id, "/tickets"), rafael)).status).toBe(503);
    } finally {
      service.down.value = false;
    }
  });
});
