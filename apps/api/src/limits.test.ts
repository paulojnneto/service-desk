import { describe, expect, it } from "vitest";
import { asksForPerson, DEFAULT_LIMITS, limitReached, readLimits, startOfDay } from "./limits";

describe("readLimits", () => {
  it("reads the environment, with defaults, and 0 turning a limit off", () => {
    expect(readLimits({})).toEqual(DEFAULT_LIMITS);
    expect(readLimits({ NEXO_AGENT_TURNS_PER_DAY: "3", NEXO_DAILY_BUDGET_USD: "0" })).toEqual({
      turnsPerDay: 3,
      dailyBudgetUsd: 0,
    });
    expect(readLimits({ NEXO_AGENT_TURNS_PER_DAY: "muitos" }).turnsPerDay).toBe(40);
  });
});

describe("limitReached", () => {
  const limits = { turnsPerDay: 3, dailyBudgetUsd: 5 };

  it("stops an employee at the allowance, and everyone at the budget", () => {
    expect(limitReached({ employeeTurns: 2, costUsd: 1 }, limits)).toBeNull();
    expect(limitReached({ employeeTurns: 3, costUsd: 1 }, limits)).toBe("employee");
    expect(limitReached({ employeeTurns: 0, costUsd: 5 }, limits)).toBe("budget");
  });

  it("ignores a limit set to 0", () => {
    expect(
      limitReached({ employeeTurns: 99, costUsd: 99 }, { turnsPerDay: 0, dailyBudgetUsd: 0 }),
    ).toBeNull();
  });
});

describe("startOfDay", () => {
  it("is midnight in São Paulo", () => {
    // 01:30 UTC on the 30th is still 22:30 on the 29th in São Paulo (UTC-3).
    expect(startOfDay(new Date("2026-10-30T01:30:00Z")).toISOString()).toBe(
      "2026-10-29T03:00:00.000Z",
    );
    expect(startOfDay(new Date("2026-10-30T12:00:00Z")).toISOString()).toBe(
      "2026-10-30T03:00:00.000Z",
    );
  });
});

describe("asksForPerson", () => {
  it.each([
    "Quero falar com um analista",
    "preciso de um ATENDENTE",
    "Posso falar com alguém? Uma pessoa",
  ])("%s", (text) => expect(asksForPerson(text)).toBe(true));
  it("is not fooled by other requests", () => {
    expect(asksForPerson("Qual o status do meu chamado?")).toBe(false);
  });
});
