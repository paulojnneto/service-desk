import { describe, expect, it } from "vitest";
import { createTicketsClient } from "./client";
import { TicketServiceError } from "./errors";

const TICKET = {
  number: "INC-20311",
  type: "INC",
  title: "Notebook lento",
  description: "Lentidão geral.",
  category: "Hardware",
  priority: "media",
  affected: "so_eu",
  status: "aguardando_analista",
  requesterId: "ana.souza",
  openedAt: "2026-10-16T17:20:00.000Z",
  lastUpdateAt: "2026-10-22T13:00:00.000Z",
  resolvedAt: null,
  dueAt: "2026-10-27T13:00:00.000Z",
  overdue: true,
  canReopen: false,
};

type Reply = Response | "network-error";

// A fake service: answers from a script and records what each attempt sent.
function fakeService(replies: Reply[]) {
  const calls: { headers: Record<string, string>; url: string }[] = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), headers: init?.headers as Record<string, string> });
    const reply = replies.shift() ?? json(500, { error: "script_ended" });
    if (reply === "network-error") throw new TypeError("fetch failed");
    return reply;
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function clientWith(service: ReturnType<typeof fakeService>, waits: number[] = []) {
  let tokens = 0;
  return createTicketsClient({
    baseUrl: "http://tickets",
    signToken: async (requesterId) => `token-${requesterId}-${++tokens}`,
    fetch: service.fetch,
    sleep: async (ms) => {
      waits.push(ms);
    },
    random: () => 0.5, // no jitter, so the waits are exact
  });
}

describe("tickets client", () => {
  it("retries through a short outage and succeeds", async () => {
    const service = fakeService([
      json(503, { error: "unavailable" }),
      "network-error",
      json(503, { error: "unavailable" }),
      json(200, { ticket: TICKET }),
    ]);
    const waits: number[] = [];

    const ticket = await clientWith(service, waits).as("ana.souza").get("INC-20311");

    expect(ticket.number).toBe("INC-20311");
    expect(service.calls).toHaveLength(4);
    expect(waits).toEqual([250, 500, 1000]);
  });

  it("gives up with 'unavailable' after five attempts", async () => {
    const service = fakeService(
      Array.from({ length: 5 }, () => json(503, { error: "unavailable" })),
    );
    const waits: number[] = [];

    const error = await clientWith(service, waits)
      .as("ana.souza")
      .list()
      .catch((e) => e);

    expect(error).toBeInstanceOf(TicketServiceError);
    expect(error).toMatchObject({ kind: "unavailable" });
    expect(service.calls).toHaveLength(5);
    expect(waits).toEqual([250, 500, 1000, 2000]);
  });

  it("keeps the idempotency key and signs a fresh token on every retry of a write", async () => {
    const service = fakeService([
      json(503, { error: "unavailable" }),
      json(201, { ticket: TICKET }),
    ]);

    await clientWith(service).as("ana.souza").addUpdate("INC-20311", "Também trava no Excel.");

    const [first, second] = service.calls;
    expect(first?.headers["idempotency-key"]).toBeDefined();
    expect(second?.headers["idempotency-key"]).toBe(first?.headers["idempotency-key"]);
    expect(second?.headers.authorization).not.toBe(first?.headers.authorization);
    expect(first?.headers.authorization).toBe("Bearer token-ana.souza-1");
  });

  it("uses a new idempotency key for each new write", async () => {
    const service = fakeService([json(201, { ticket: TICKET }), json(201, { ticket: TICKET })]);
    const client = clientWith(service).as("ana.souza");

    await client.addUpdate("INC-20311", "a");
    await client.addUpdate("INC-20311", "b");

    expect(service.calls[0]?.headers["idempotency-key"]).not.toBe(
      service.calls[1]?.headers["idempotency-key"],
    );
  });

  it("never retries a 4xx and turns it into a typed error with the service's code", async () => {
    const notFound = fakeService([json(404, { error: "not_found" })]);
    const conflict = fakeService([json(409, { error: "reopen_window_expired" })]);

    const missing = await clientWith(notFound)
      .as("ana.souza")
      .get("INC-1")
      .catch((e) => e);
    const expired = await clientWith(conflict)
      .as("ana.souza")
      .reopen("INC-19877", "x")
      .catch((e) => e);

    expect(missing).toMatchObject({ kind: "not_found", code: "not_found" });
    expect(expired).toMatchObject({ kind: "conflict", code: "reopen_window_expired" });
    expect(notFound.calls).toHaveLength(1);
    expect(conflict.calls).toHaveLength(1);
  });

  it("does not send reads with an idempotency key", async () => {
    const service = fakeService([json(200, { tickets: [TICKET] })]);

    await clientWith(service).as("ana.souza").list("open");

    expect(service.calls[0]?.url).toBe("http://tickets/tickets?scope=open");
    expect(service.calls[0]?.headers["idempotency-key"]).toBeUndefined();
  });
});
