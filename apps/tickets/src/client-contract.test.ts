import { TZDate } from "@date-fns/tz";
import { TIME_ZONE } from "@nexo/shared";
import { createServiceTokenSigner, createTicketsClient } from "@nexo/tickets-client";
import { exportPKCS8 } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { createTestDb } from "./db/test-db";
import { seedDatabase } from "./seed/seed";
import { testKeys } from "./test-tokens";

// The real client against the real service (PGlite and the sample data): both sides agree
// on the token, the idempotency keys, the response shapes and the error codes.
const NOW = new Date(new TZDate(2026, 9, 28, 10, 0, TIME_ZONE).getTime());
let client: ReturnType<typeof createTicketsClient>;

beforeAll(async () => {
  const db = await createTestDb();
  await seedDatabase(db, NOW);
  const keys = await testKeys();
  const app = createApp({ db, tokenPublicKey: keys.publicKey, now: () => NOW });
  client = createTicketsClient({
    baseUrl: "http://tickets",
    signToken: createServiceTokenSigner(await exportPKCS8(keys.privateKey)),
    fetch: (async (url: string, init?: RequestInit) =>
      app.fetch(new Request(url, init))) as typeof fetch,
  });
});

describe("client and service contract", () => {
  it("reads Ana's tickets and the overdue one", async () => {
    const ana = client.as("ana.souza");

    expect((await ana.list("open")).map((t) => t.number).sort()).toEqual([
      "INC-20298",
      "INC-20311",
      "REQ-10442",
    ]);
    expect((await ana.get("INC-20311")).overdue).toBe(true);
  });

  it("creates, updates, reopens, transfers and takes over", async () => {
    const ana = client.as("ana.souza");

    const created = await ana.create({
      type: "INC",
      title: "VPN não conecta no notebook",
      description: "Erro 809 desde ontem, no Windows 11.",
      category: "Rede e VPN",
      priority: "alta",
      affected: "so_eu",
    });
    const updated = await ana.addUpdate(created.number, "Tenho reunião às 14h.");
    const reopened = await ana.reopen("INC-20150", "O SAP bloqueou de novo.");
    const transferred = await ana.transfer("INC-20311", "Lentidão há 6 dias; prazo vencido.");

    expect(created.number).toBe("INC-20312");
    expect(updated.events?.at(-1)?.kind).toBe("updated");
    expect(reopened.status).toBe("aguardando_analista");
    expect(transferred.events?.at(-1)?.kind).toBe("transferred");

    const taken = await ana.takeOver("INC-20311", {
      analystId: "rafael.lima",
      analystName: "Rafael Lima",
    });
    expect(taken.status).toBe("em_andamento");
  });

  it("turns the service's refusals into typed errors", async () => {
    const ana = client.as("ana.souza");

    await expect(ana.get("REQ-10439")).rejects.toMatchObject({ kind: "not_found" });
    await expect(ana.reopen("INC-19877", "x")).rejects.toMatchObject({
      kind: "conflict",
      code: "reopen_window_expired",
    });
  });

  it("searches the help center", async () => {
    const articles = await client.as("ana.souza").searchArticles("VPN erro 809");
    expect(articles[0]?.id).toBe("vpn-erro-809");
  });
});
