import type { DraftInput } from "@nexo/agent";
import { dueAt, type DraftView, type StoredMessage } from "@nexo/shared";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  appendEmployeeMessage,
  closeOpenConversation,
  findOpenConversation,
  listDecisions,
} from "../conversations/repository";
import { queryRows, type Db } from "../db/connect";
import { prepareDraft } from "../drafts/repository";
import { createTestApp, postJson, signIn, testTickets } from "../test-app";

let app: Awaited<ReturnType<typeof createTestApp>>["app"];
let db: Db;
let tickets: Awaited<ReturnType<typeof createTestApp>>["tickets"];

beforeEach(async () => {
  const service = await testTickets();
  await service.reseed();
  service.down.value = false;
  ({ app, db, tickets } = await createTestApp());
});

type Answer = { draft?: DraftView; message?: StoredMessage | null; error?: string };

const VPN: DraftInput = {
  kind: "create",
  fields: {
    type: "INC",
    title: "VPN não conecta no notebook — erro 809",
    description: "Desde ontem o notebook (Windows 11) não conecta na VPN e mostra o erro 809.",
    category: "Rede e VPN",
    impact: "so_eu",
    urgency: "compromisso_hoje",
    priority: "alta",
    dueAt: dueAt("alta", new Date()).toISOString(),
  },
  duplicates: [],
};

// A draft in Ana's open conversation, as the agent's tools would store it.
async function draftFor(employeeId: string, input: DraftInput = VPN) {
  await appendEmployeeMessage(
    db,
    employeeId,
    { clientId: crypto.randomUUID(), parts: [] },
    new Date(),
  );
  const open = await findOpenConversation(db, employeeId);
  return prepareDraft(db, { employeeId, conversationId: open!.id }, input, new Date());
}

async function patch(cookie: string, id: string, body: unknown) {
  const res = await app.request(`/api/drafts/${id}`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Answer };
}

const editable = {
  type: "INC",
  title: "VPN não conecta no notebook — erro 809",
  description: "Desde ontem o notebook (Windows 11) não conecta na VPN e mostra o erro 809.",
  category: "Rede e VPN",
  impact: "so_eu",
  urgency: "compromisso_hoje",
} as const;

async function decide(cookie: string, id: string, action: "confirm" | "cancel") {
  const res = await postJson(app, `/api/drafts/${id}/${action}`, {}, cookie);
  return { status: res.status, body: (await res.json()) as Answer };
}

const anaTickets = () => tickets.as("ana.souza").list("all");

describe("POST /api/drafts/:id/confirm", () => {
  it("creates exactly one ticket and answers with a reply and a decision written by code", async () => {
    const { cookie } = await signIn(app, "ana.souza@nexo.com.br");
    const draft = await draftFor("ana.souza");

    const { status, body } = await decide(cookie, draft.id, "confirm");

    expect(status).toBe(200);
    expect(body.draft).toMatchObject({ status: "confirmed", resultTicket: "INC-20312" });
    const text = (body.message?.parts[0] as { text: string }).text;
    expect(text).toContain("Abri o chamado INC-20312");
    // Marked as the server's, with every rule from the code that ran (stage 8, S-08.7).
    expect(body.message?.metadata.decision).toEqual({
      intent: "abrir_chamado",
      action: "criou_chamado",
      confidence: "alta",
      rationale: `A pessoa confirmou o rascunho ${draft.number}.`,
      rules: [],
      enforcedRules: ["R3", "R4", "R9"],
      tools: [{ name: "criarChamado", outcome: "ok", subject: "INC-20312" }],
      source: "server",
      registered: true,
    });
    const created = (await anaTickets()).find((t) => t.number === "INC-20312");
    expect(created).toMatchObject({ priority: "alta", affected: "so_eu", category: "Rede e VPN" });
    const open = await findOpenConversation(db, "ana.souza");
    expect(await listDecisions(db, open!.id)).toHaveLength(1);
  });

  it("is safe to repeat: a second confirmation creates nothing new", async () => {
    const { cookie } = await signIn(app, "ana.souza@nexo.com.br");
    const draft = await draftFor("ana.souza");
    const before = (await anaTickets()).length;

    const [first, second] = await Promise.all([
      decide(cookie, draft.id, "confirm"),
      decide(cookie, draft.id, "confirm"),
    ]);
    const third = await decide(cookie, draft.id, "confirm");

    // The loser either finds it "confirming" (409) or already "confirmed" (200, same ticket).
    expect([first.status, second.status]).toContain(200);
    expect([200, 409]).toEqual(expect.arrayContaining([first.status, second.status]));
    expect(third).toMatchObject({ status: 200, body: { draft: { resultTicket: "INC-20312" } } });
    expect((await anaTickets()).length).toBe(before + 1);
  });

  it("adds information and reopens through drafts", async () => {
    const { cookie } = await signIn(app, "ana.souza@nexo.com.br");
    const update = await draftFor("ana.souza", {
      kind: "update",
      ticketNumber: "INC-20311",
      fields: { message: "Também trava ao abrir o Excel." },
    });
    expect((await decide(cookie, update.id, "confirm")).status).toBe(200);

    const reopen = await draftFor("ana.souza", {
      kind: "reopen",
      ticketNumber: "INC-20150",
      fields: { reason: "A senha voltou a bloquear." },
    });
    const { body } = await decide(cookie, reopen.id, "confirm");

    expect(body.message?.metadata.decision).toMatchObject({
      action: "reabriu_chamado",
      enforcedRules: ["R3", "R5"],
      tools: [{ name: "reabrirChamado", outcome: "ok", subject: "INC-20150" }],
    });
    const history = await tickets.as("ana.souza").get("INC-20311");
    expect(history.events?.at(-1)).toMatchObject({ kind: "updated" });
    expect((await tickets.as("ana.souza").get("INC-20150")).status).not.toBe("resolvido");
  });

  it("answers 404 for another person's draft and for ids that are not UUIDs", async () => {
    const bruno = await signIn(app, "bruno.tavares@nexo.com.br");
    const draft = await draftFor("ana.souza");

    expect((await decide(bruno.cookie, draft.id, "confirm")).status).toBe(404);
    expect((await decide(bruno.cookie, "D-381", "confirm")).status).toBe(404);
    expect((await anaTickets()).some((t) => t.number === "INC-20312")).toBe(false);
  });

  it("refuses a draft of a conversation that was closed", async () => {
    const { cookie } = await signIn(app, "ana.souza@nexo.com.br");
    const draft = await draftFor("ana.souza");
    await closeOpenConversation(db, "ana.souza", new Date());

    expect(await decide(cookie, draft.id, "confirm")).toMatchObject({
      status: 409,
      body: { error: "draft_closed" },
    });
  });

  it("keeps the draft pending when the ticket service is down, and works once it is back", async () => {
    const { cookie } = await signIn(app, "ana.souza@nexo.com.br");
    const draft = await draftFor("ana.souza");
    const service = await testTickets();

    service.down.value = true;
    expect((await decide(cookie, draft.id, "confirm")).status).toBe(503);
    const [row] = await queryRows<{ status: string }>(
      db,
      sql`select status from drafts where id = ${draft.id}`,
    );
    expect(row?.status).toBe("pending");

    service.down.value = false;
    expect((await decide(cookie, draft.id, "confirm")).status).toBe(200);
  });

  it("explains a refusal from the ticket service and closes the draft", async () => {
    const { cookie } = await signIn(app, "ana.souza@nexo.com.br");
    const draft = await draftFor("ana.souza", {
      kind: "reopen",
      ticketNumber: "INC-19877",
      fields: { reason: "Voltou a acontecer." },
    });

    const { status, body } = await decide(cookie, draft.id, "confirm");

    expect(status).toBe(409);
    expect(body.error).toBe("ticket_conflict");
    expect((body.message?.parts[0] as { text: string }).text).toContain("7 dias");
    expect(body.draft?.status).toBe("cancelled");
  });
});

describe("POST /api/drafts/:id/cancel", () => {
  it("cancels the draft and creates nothing", async () => {
    const { cookie } = await signIn(app, "ana.souza@nexo.com.br");
    const draft = await draftFor("ana.souza");
    const before = (await anaTickets()).length;

    const { status, body } = await decide(cookie, draft.id, "cancel");

    expect(status).toBe(200);
    expect(body.draft?.status).toBe("cancelled");
    expect(body.message?.metadata.decision).toMatchObject({
      action: "cancelou_rascunho",
      rationale: `A pessoa cancelou o rascunho ${draft.number}.`,
      enforcedRules: ["R3"],
      tools: [{ name: "cancelarRascunho", outcome: "ok", subject: draft.number }],
      source: "server",
    });
    // The stored record is the one the reply carried.
    const res = await app.request("/api/conversations/current", { headers: { cookie } });
    const { conversation } = (await res.json()) as { conversation: { messages: StoredMessage[] } };
    expect(conversation.messages.at(-1)?.metadata.decision).toEqual(
      body.message?.metadata.decision,
    );
    expect((await decide(cookie, draft.id, "confirm")).body.error).toBe("draft_closed");
    expect((await anaTickets()).length).toBe(before);
  });

  it("answers 403 to analysts", async () => {
    const rafael = await signIn(app, "rafael.lima@nexo.com.br");
    const draft = await draftFor("ana.souza");

    expect((await decide(rafael.cookie, draft.id, "cancel")).status).toBe(403);
  });
});

describe("PATCH /api/drafts/:id", () => {
  it("recalculates priority and deadline on the server and keeps the same draft", async () => {
    const { cookie } = await signIn(app, "ana.souza@nexo.com.br");
    const draft = await draftFor("ana.souza");

    const { status, body } = await patch(cookie, draft.id, {
      kind: "create",
      fields: { ...editable, title: "VPN fora para a equipe", impact: "equipe", urgency: "parado" },
    });

    expect(status).toBe(200);
    expect(body.draft).toMatchObject({
      id: draft.id,
      number: draft.number,
      status: "pending",
      fields: { title: "VPN fora para a equipe", priority: "critica", impact: "equipe" },
    });
    const fields = (body.draft as Extract<DraftView, { kind: "create" }>).fields;
    expect(new Date(fields.dueAt).getTime()).toBeLessThan(
      new Date((draft as Extract<DraftView, { kind: "create" }>).fields.dueAt).getTime(),
    );
    expect(body.message?.metadata.author).toBe("system");
    expect((body.message?.parts[0] as { text: string }).text).toBe(
      `Você editou o rascunho ${draft.number}.`,
    );
  });

  it("ignores a priority sent by the client and lists duplicates again when the category changes", async () => {
    const { cookie } = await signIn(app, "ana.souza@nexo.com.br");
    const draft = await draftFor("ana.souza");

    const { status, body } = await patch(cookie, draft.id, {
      kind: "create",
      fields: { ...editable, category: "Hardware", urgency: "sem_urgencia", priority: "critica" },
    });

    expect(status).toBe(200);
    expect(body.draft).toMatchObject({ fields: { priority: "baixa" } });
    expect(body.draft?.duplicates.map((d) => d.number)).toContain("INC-20311");
  });

  it("does not count the edit note toward the message limit", async () => {
    const { cookie } = await signIn(app, "ana.souza@nexo.com.br");
    const draft = await draftFor("ana.souza");
    const before = (await findOpenConversation(db, "ana.souza"))!.employeeMessages;

    await patch(cookie, draft.id, { kind: "create", fields: editable });

    expect((await findOpenConversation(db, "ana.souza"))!.employeeMessages).toBe(before);
  });

  it("refuses invalid fields, another kind, closed drafts, other people and analysts", async () => {
    const { cookie } = await signIn(app, "ana.souza@nexo.com.br");
    const bruno = await signIn(app, "bruno.tavares@nexo.com.br");
    const rafael = await signIn(app, "rafael.lima@nexo.com.br");
    const draft = await draftFor("ana.souza");

    expect(
      (await patch(cookie, draft.id, { kind: "create", fields: { ...editable, title: "" } }))
        .status,
    ).toBe(400);
    expect(
      (await patch(cookie, draft.id, { kind: "update", fields: { message: "oi" } })).status,
    ).toBe(400);
    expect((await patch(bruno.cookie, draft.id, { kind: "create", fields: editable })).status).toBe(
      404,
    );
    expect(
      (await patch(rafael.cookie, draft.id, { kind: "create", fields: editable })).status,
    ).toBe(403);

    await decide(cookie, draft.id, "cancel");
    expect(await patch(cookie, draft.id, { kind: "create", fields: editable })).toMatchObject({
      status: 409,
      body: { error: "draft_closed" },
    });
  });

  it("edits the message of an update draft", async () => {
    const { cookie } = await signIn(app, "ana.souza@nexo.com.br");
    const draft = await draftFor("ana.souza", {
      kind: "update",
      ticketNumber: "INC-20311",
      fields: { message: "Também trava no Excel." },
    });

    const { body } = await patch(cookie, draft.id, {
      kind: "update",
      fields: { message: "Também trava no Excel e no Teams." },
    });

    expect(body.draft?.fields).toEqual({ message: "Também trava no Excel e no Teams." });
  });
});

describe("GET /api/conversations/current with drafts", () => {
  it("returns every draft in its current state", async () => {
    const { cookie } = await signIn(app, "ana.souza@nexo.com.br");
    const first = await draftFor("ana.souza");
    const second = await draftFor("ana.souza");
    await decide(cookie, second.id, "confirm");

    const res = await app.request("/api/conversations/current", { headers: { cookie } });
    const { conversation } = (await res.json()) as {
      conversation: { drafts: DraftView[]; pendingDraftId: string | null };
    };

    expect(conversation.drafts.map((d) => [d.id, d.status, d.resultTicket])).toEqual([
      [first.id, "superseded", null],
      [second.id, "confirmed", "INC-20312"],
    ]);
    expect(conversation.pendingDraftId).toBeNull();
  });
});
