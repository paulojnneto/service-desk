import type { DraftView } from "@nexo/shared";
import { describe, expect, it } from "vitest";
import { requestContextFor, type AgentServices } from "../context";
import { instructionsFor } from "./instructions";

const services = { now: () => new Date("2026-10-28T13:00:00Z") } as AgentServices;

const draft = {
  id: "d1",
  number: "D-381",
  kind: "create",
  status: "pending",
  ticketNumber: null,
  duplicates: [],
  resultTicket: null,
  createdAt: "2026-10-28T13:00:00Z",
  fields: {
    type: "INC",
    title: "VPN não conecta — erro 809",
    description: "Desde ontem a VPN mostra o erro 809.",
    category: "Rede e VPN",
    impact: "empresa",
    urgency: "parado",
    priority: "critica",
    dueAt: "2026-10-28T14:00:00Z",
  },
} satisfies DraftView;

describe("instructionsFor", () => {
  it("includes the waiting draft as it is now, so the agent sees edits", () => {
    const text = instructionsFor(
      requestContextFor({ userId: "ana.souza", firstName: "Ana", services, waitingDraft: draft }),
    );

    expect(text).toContain("Rascunho aguardando confirmação: D-381");
    expect(text).toContain("afetados empresa, urgência parado, prioridade Crítica");
  });

  it("sends every reopening through the tool and asks for rationales both readers understand", () => {
    const text = instructionsFor(
      requestContextFor({ userId: "ana.souza", firstName: "Ana", services }),
    );

    expect(text).toContain("Para qualquer pedido de reabertura, chame prepararReabertura");
    expect(text).toContain("Não decida pela data");
    expect(text).toContain("para o funcionário e para o analista");
    expect(text).toContain("Não cite nomes de ferramentas, códigos de regra ou de intenção");
  });

  it("says nothing about drafts when none is waiting", () => {
    const text = instructionsFor(
      requestContextFor({ userId: "ana.souza", firstName: "Ana", services }),
    );

    expect(text).not.toContain("Rascunho aguardando confirmação:");
  });
});
