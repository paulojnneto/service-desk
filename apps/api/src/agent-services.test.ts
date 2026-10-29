import { beforeEach, describe, expect, it } from "vitest";
import { buildAgentServices } from "./agent-services";
import {
  appendEmployeeMessage,
  findOpenConversation,
  listHandoffs,
} from "./conversations/repository";
import type { Db } from "./db/connect";
import { createTestApp, testTickets } from "./test-app";

let db: Db;
let tickets: Awaited<ReturnType<typeof createTestApp>>["tickets"];

beforeEach(async () => {
  ({ db, tickets } = await createTestApp());
});

describe("handoff with the ticket service down (stage 11 resilience review)", () => {
  it("still hands off, keeping the related ticket, without the transfer event", async () => {
    const now = new Date();
    await appendEmployeeMessage(db, "ana.souza", { clientId: "c1", parts: [] }, now);
    const open = await findOpenConversation(db, "ana.souza");
    const services = buildAgentServices({
      db,
      tickets,
      employeeId: "ana.souza",
      conversationId: open!.id,
      now: () => now,
    });
    const service = await testTickets();

    service.down.value = true;
    let handedOff: boolean;
    try {
      handedOff = await services.handoff({
        trigger: "chamado_vencido",
        summary: "INC-20311 vencido; Ana quer um analista.",
        ticketNumber: "INC-20311",
      });
    } finally {
      service.down.value = false;
    }

    expect(handedOff).toBe(true);
    expect((await findOpenConversation(db, "ana.souza"))?.state).toBe("waiting_analyst");
    expect(await listHandoffs(db, open!.id)).toEqual([
      expect.objectContaining({ reason: "chamado_vencido", ticketNumber: "INC-20311" }),
    ]);
    const ticket = await tickets.as("ana.souza").get("INC-20311");
    expect(ticket.events?.some((event) => event.kind === "transferred")).toBe(false);
  });
});
