import type { ConversationSummary } from "@nexo/shared";
import { describe, expect, it } from "vitest";
import { rowStatus, stateBadge, waitingFor } from "./status";

const base: ConversationSummary = {
  id: "c1",
  employee: {
    id: "ana.souza",
    name: "Ana Souza",
    department: "Financeiro",
    initials: "AS",
    avatar: { bg: "#fff", fg: "#000" },
  },
  state: "with_agent",
  holder: null,
  lastMessage: null,
  lastConfidence: "alta",
  handoff: null,
  updatedAt: "2026-10-29T10:00:00Z",
};
const rafael = { id: "rafael.lima", name: "Rafael Lima", level: "Suporte N2" };
const handoff = { summary: "…", at: "2026-10-29T10:00:00Z" };

describe("rowStatus", () => {
  it.each([
    [{ state: "closed" }, "Encerrada", "muted"],
    [{ state: "with_agent" }, "Agente atendendo", "success"],
    [{ state: "with_agent", lastConfidence: "baixa" }, "Agente com confiança baixa", "warning"],
    [
      {
        state: "waiting_analyst",
        handoff: { ...handoff, reason: "chamado_vencido", ticketNumber: "INC-20311" },
      },
      "Transferida · INC-20311",
      "danger",
    ],
    [
      {
        state: "waiting_analyst",
        handoff: { ...handoff, reason: "baixa_confianca", ticketNumber: null },
      },
      "Agente pediu ajuda · confiança baixa",
      "warning",
    ],
    [{ state: "with_analyst", holder: rafael }, "Você está atendendo", "primary"],
    [
      { state: "with_analyst", holder: { ...rafael, id: "julia.castro", name: "Júlia Castro" } },
      "Júlia Castro está atendendo",
      "violet",
    ],
  ] as const)("%o → %s", (change, text, tone) => {
    expect(rowStatus({ ...base, ...change } as ConversationSummary, "rafael.lima")).toEqual({
      text,
      tone,
    });
  });
});

describe("stateBadge", () => {
  it("names the waiting state and who holds the conversation", () => {
    expect(stateBadge("waiting_analyst", null, "rafael.lima").text).toBe("Aguardando atendente");
    expect(stateBadge("with_analyst", rafael, "rafael.lima").text).toBe("Você está atendendo");
  });
});

describe("waitingFor", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  it.each([
    ["2026-10-29T11:59:40Z", "agora"],
    ["2026-10-29T11:48:00Z", "há 12 min"],
    ["2026-10-29T09:30:00Z", "há 2 h"],
    ["2026-10-26T12:00:00Z", "há 3 dias"],
  ])("%s → %s", (since, text) => {
    expect(waitingFor(since, now)).toBe(text);
  });
});
