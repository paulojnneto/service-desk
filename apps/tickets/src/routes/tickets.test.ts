import { TZDate } from "@date-fns/tz";
import { TIME_ZONE, type Ticket } from "@nexo/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import type { Db } from "../db/connect";
import { ticketEvents, tickets } from "../db/schema";
import { createTestDb } from "../db/test-db";
import { signTestToken, testKeys } from "../test-tokens";

// Wednesday, 28 October 2026, 10:00 in São Paulo.
const NOW = new Date(new TZDate(2026, 9, 28, 10, 0, TIME_ZONE).getTime());
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);

let db: Db;
let app: ReturnType<typeof createApp>;
let keys: Awaited<ReturnType<typeof testKeys>>;
let now: Date;

beforeEach(async () => {
  db = await createTestDb();
  keys = await testKeys();
  now = NOW;
  app = createApp({ db, tokenPublicKey: keys.publicKey, now: () => now });
});

// Calls the service as a person, the way the API does: a signed token per request.
function as(requesterId: string) {
  async function call(method: string, path: string, body?: unknown, key?: string) {
    const headers: Record<string, string> = {
      authorization: `Bearer ${await signTestToken(keys.privateKey, requesterId)}`,
      "content-type": "application/json",
    };
    if (method === "POST") headers["idempotency-key"] = key ?? crypto.randomUUID();
    const res = await app.request(path, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      res,
      json: (await res.json()) as { ticket: Ticket; tickets: Ticket[]; error: string },
    };
  }
  return {
    get: (path: string) => call("GET", path),
    post: (path: string, body: unknown, key?: string) => call("POST", path, body, key),
  };
}

async function insertTicket(values: Partial<typeof tickets.$inferInsert> & { number: string }) {
  await db.insert(tickets).values({
    type: "INC",
    title: "Notebook lento após atualização do Windows",
    description: "Lentidão geral desde a atualização.",
    category: "Hardware",
    priority: "media",
    affected: "so_eu",
    status: "aguardando_analista",
    requesterId: "ana.souza",
    openedAt: daysAgo(10),
    lastUpdateAt: daysAgo(1),
    ...values,
  });
}

const vpnTicket = {
  type: "INC",
  title: "VPN não conecta no notebook",
  description: "Erro 809 desde ontem, no Windows 11.",
  category: "Rede e VPN",
  priority: "alta",
  affected: "so_eu",
};

describe("create", () => {
  it("creates a ticket with the next number of its type and an 'opened' event", async () => {
    const inc = await as("ana.souza").post("/tickets", vpnTicket);
    const req = await as("ana.souza").post("/tickets", {
      ...vpnTicket,
      type: "REQ",
      title: "Segundo monitor",
      description: "Pedido de segundo monitor para home office.",
      priority: "baixa",
    });

    expect(inc.res.status).toBe(201);
    expect(inc.json.ticket).toMatchObject({
      number: "INC-20312",
      status: "aguardando_analista",
      requesterId: "ana.souza",
      overdue: false,
    });
    expect(inc.json.ticket.events?.map((e) => e.kind)).toEqual(["opened"]);
    expect(req.json.ticket.number).toBe("REQ-10443");
  });

  it("refuses a ticket with a missing field", async () => {
    const { res, json } = await as("ana.souza").post("/tickets", {
      ...vpnTicket,
      category: undefined,
    });

    expect(res.status).toBe(400);
    expect(json.error).toBe("invalid_input");
  });

  it("returns the same ticket when the same idempotency key is repeated", async () => {
    const first = await as("ana.souza").post("/tickets", vpnTicket, "key-1");
    const retry = await as("ana.souza").post("/tickets", vpnTicket, "key-1");
    const other = await as("ana.souza").post("/tickets", vpnTicket, "key-2");

    expect(retry.res.status).toBe(201);
    expect(retry.res.headers.get("idempotent-replay")).toBe("true");
    expect(retry.json.ticket.number).toBe(first.json.ticket.number);
    expect(other.json.ticket.number).not.toBe(first.json.ticket.number);
    expect((await db.select().from(tickets)).length).toBe(2);
  });

  it("requires an idempotency key on writes", async () => {
    const token = await signTestToken(keys.privateKey, "ana.souza");
    const res = await app.request("/tickets", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(vpnTicket),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing_idempotency_key" });
  });
});

describe("privacy and listing", () => {
  beforeEach(async () => {
    await insertTicket({
      number: "INC-1",
      status: "resolvido",
      lastUpdateAt: daysAgo(0.1),
      resolvedAt: daysAgo(0.1),
    });
    await insertTicket({ number: "INC-2", lastUpdateAt: daysAgo(2) });
    await insertTicket({ number: "INC-3", requesterId: "carla.mendes" });
  });

  it("lists only the requester's tickets, open ones first", async () => {
    const { json } = await as("ana.souza").get("/tickets");

    expect(json.tickets.map((t) => t.number)).toEqual(["INC-2", "INC-1"]);
  });

  it("lists only open tickets with scope=open", async () => {
    const { json } = await as("ana.souza").get("/tickets?scope=open");

    expect(json.tickets.map((t) => t.number)).toEqual(["INC-2"]);
  });

  it("answers 404 for someone else's ticket, on reads and writes", async () => {
    const read = await as("ana.souza").get("/tickets/INC-3");
    const write = await as("ana.souza").post("/tickets/INC-3/updates", { message: "oi" });

    expect(read.res.status).toBe(404);
    expect(write.res.status).toBe(404);
    expect(read.json.error).toBe("not_found");
  });
});

describe("deadlines", () => {
  it("marks a medium ticket without updates for 6 days as overdue", async () => {
    await insertTicket({ number: "INC-20311", lastUpdateAt: daysAgo(6) });
    await insertTicket({ number: "INC-9", lastUpdateAt: daysAgo(0) });

    const overdue = await as("ana.souza").get("/tickets/INC-20311");
    const fresh = await as("ana.souza").get("/tickets/INC-9");

    expect(overdue.json.ticket.overdue).toBe(true);
    expect(fresh.json.ticket.overdue).toBe(false);
  });
});

describe("updates", () => {
  it("adds an event and moves the deadline", async () => {
    await insertTicket({ number: "INC-20311", lastUpdateAt: daysAgo(6) });
    const before = await as("ana.souza").get("/tickets/INC-20311");

    const { res, json } = await as("ana.souza").post("/tickets/INC-20311/updates", {
      message: "Agora também trava ao abrir o Excel.",
    });

    expect(res.status).toBe(201);
    expect(json.ticket.lastUpdateAt).toBe(NOW.toISOString());
    expect(json.ticket.dueAt).not.toBe(before.json.ticket.dueAt);
    expect(json.ticket.overdue).toBe(false);
    expect(json.ticket.events?.at(-1)).toMatchObject({
      kind: "updated",
      message: "Agora também trava ao abrir o Excel.",
    });
  });

  it("refuses updates on resolved tickets", async () => {
    await insertTicket({ number: "INC-1", status: "resolvido", resolvedAt: daysAgo(1) });
    const { res, json } = await as("ana.souza").post("/tickets/INC-1/updates", { message: "oi" });

    expect(res.status).toBe(409);
    expect(json.error).toBe("ticket_closed");
  });
});

describe("reopen", () => {
  beforeEach(async () => {
    await insertTicket({ number: "INC-20150", status: "resolvido", resolvedAt: daysAgo(4) });
    await insertTicket({ number: "INC-19877", status: "resolvido", resolvedAt: daysAgo(8) });
    await insertTicket({ number: "INC-2" });
  });

  it("reopens a ticket resolved up to 7 days ago", async () => {
    const { res, json } = await as("ana.souza").post("/tickets/INC-20150/reopen", {
      reason: "O SAP bloqueou de novo.",
    });

    expect(res.status).toBe(200);
    expect(json.ticket).toMatchObject({ status: "aguardando_analista", resolvedAt: null });
    expect(json.ticket.events?.at(-1)?.kind).toBe("reopened");
  });

  it("explains why it cannot reopen", async () => {
    const expired = await as("ana.souza").post("/tickets/INC-19877/reopen", { reason: "x" });
    const open = await as("ana.souza").post("/tickets/INC-2/reopen", { reason: "x" });

    expect(expired.res.status).toBe(409);
    expect(expired.json.error).toBe("reopen_window_expired");
    expect(open.json.error).toBe("not_resolved");
  });

  it("replays the first success when a reopen is retried", async () => {
    const first = await as("ana.souza").post("/tickets/INC-20150/reopen", { reason: "x" }, "k");
    const retry = await as("ana.souza").post("/tickets/INC-20150/reopen", { reason: "x" }, "k");

    expect(retry.res.status).toBe(200);
    expect(retry.json).toEqual(first.json);
    const events = await db.select().from(ticketEvents);
    expect(events.filter((e) => e.kind === "reopened")).toHaveLength(1);
  });
});

describe("transfer", () => {
  it("records the summary without moving the deadline", async () => {
    await insertTicket({ number: "INC-20311", lastUpdateAt: daysAgo(6) });
    const { res, json } = await as("ana.souza").post("/tickets/INC-20311/transfers", {
      summary: "Lentidão há 6 dias; prazo vencido; funcionária pediu analista.",
    });

    expect(res.status).toBe(201);
    expect(json.ticket.overdue).toBe(true);
    expect(json.ticket.events?.at(-1)).toMatchObject({
      kind: "transferred",
      message: "Lentidão há 6 dias; prazo vencido; funcionária pediu analista.",
    });
  });
});

describe("take over", () => {
  const rafael = { analystId: "rafael.lima", analystName: "Rafael Lima" };

  it("moves a waiting ticket to em andamento and restarts the deadline", async () => {
    await insertTicket({ number: "INC-20311", lastUpdateAt: daysAgo(6) });
    const { res, json } = await as("ana.souza").post("/tickets/INC-20311/take-over", rafael);

    expect(res.status).toBe(200);
    expect(json.ticket).toMatchObject({ status: "em_andamento", overdue: false });
    expect(json.ticket.lastUpdateAt).toBe(NOW.toISOString());
    expect(json.ticket.events?.at(-1)).toMatchObject({
      kind: "status_changed",
      authorId: "rafael.lima",
      message: "Assumido por Rafael Lima",
    });
  });

  it("leaves any other status as it is", async () => {
    await insertTicket({ number: "REQ-10442", status: "aprovado" });
    const { res, json } = await as("ana.souza").post("/tickets/REQ-10442/take-over", rafael);

    expect(res.status).toBe(200);
    expect(json.ticket.status).toBe("aprovado");
    expect(await db.select().from(ticketEvents)).toHaveLength(0);
  });

  it("answers not found for someone else's ticket", async () => {
    await insertTicket({ number: "REQ-10439", requesterId: "carla.mendes" });
    const { res } = await as("ana.souza").post("/tickets/REQ-10439/take-over", rafael);

    expect(res.status).toBe(404);
  });
});

describe("release", () => {
  const rafael = { analystId: "rafael.lima", analystName: "Rafael Lima" };

  it("undoes the analyst's take-over, keeping the deadline from it", async () => {
    await insertTicket({ number: "INC-20311", lastUpdateAt: daysAgo(6) });
    await as("ana.souza").post("/tickets/INC-20311/take-over", rafael);
    now = new Date(NOW.getTime() + 60 * 60 * 1000);
    const { res, json } = await as("ana.souza").post("/tickets/INC-20311/release", {
      analystId: "rafael.lima",
    });

    expect(res.status).toBe(200);
    expect(json.ticket.status).toBe("aguardando_analista");
    expect(json.ticket.lastUpdateAt).toBe(NOW.toISOString());
    expect(json.ticket.events?.at(-1)).toMatchObject({
      kind: "status_changed",
      message: "Devolvido ao Nexo Assist",
    });
  });

  it("leaves a ticket another analyst was already working on", async () => {
    await insertTicket({ number: "INC-20298", status: "em_andamento" });
    await db.insert(ticketEvents).values({
      ticketNumber: "INC-20298",
      kind: "status_changed",
      at: daysAgo(1),
      authorId: "rafael.lima",
      message: "Em andamento: pedido enviado ao dono da pasta.",
    });
    const { json } = await as("ana.souza").post("/tickets/INC-20298/release", {
      analystId: "rafael.lima",
    });

    expect(json.ticket.status).toBe("em_andamento");
  });
});
