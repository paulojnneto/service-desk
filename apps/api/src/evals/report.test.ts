import type { DecisionRecord } from "@nexo/shared";
import { describe, expect, it } from "vitest";
import { consoleReport, markdownReport, summarize } from "./report";
import type { Scenario, ScenarioResult } from "./types";

const scenario = (name: string): Scenario => ({
  name,
  title: `Cenário ${name}`,
  employee: "ana.souza",
  covers: ["R5"],
  reliesOn: "S-08.11",
  turns: [{ say: "Quero reabrir o INC-19877" }],
});

const decision: DecisionRecord = {
  intent: "reabrir_chamado",
  action: "consultou_chamados",
  confidence: "alta",
  rationale: "O chamado foi resolvido há mais de 7 dias.",
  rules: ["R5"],
  enforcedRules: ["R7"],
  tools: [{ name: "consultarChamado", outcome: "ok", subject: "INC-19877" }],
  source: "agent",
  registered: true,
};

function result(name: string, passed: boolean, run = 1): ScenarioResult {
  return {
    scenario: scenario(name),
    run,
    passed,
    turns: [
      {
        index: 0,
        observation: {
          said: "Quero reabrir o INC-19877",
          reply: "Não consigo reabrir o INC-19877.",
          decision,
          tools: [],
          question: null,
          state: "with_agent",
          newDrafts: [],
          newHandoffs: [],
          ticketsWritten: [],
        },
        checks: [
          {
            check: "called prepararReabertura",
            passed,
            expected: "called",
            actual: "consultarChamado",
          },
          { check: "no draft", passed: true, expected: "none", actual: "none" },
        ],
      },
    ],
    usage: { inputTokens: 1000, cachedInputTokens: 600, outputTokens: 80, steps: 2, turns: 1 },
    durationMs: 1500,
  };
}

const info = { model: "openai/gpt-5.5", date: "2026-10-29", repeat: 1 };

describe("summarize", () => {
  it("adds up the runs of each scenario", () => {
    const [summary] = summarize([result("a", true, 1), result("a", false, 2)]);
    expect(summary).toMatchObject({
      runs: 2,
      passed: 1,
      checks: { passed: 3, total: 4 },
      modelCalls: 4,
      inputTokens: 2000,
      durationMs: 3000,
    });
  });
});

describe("consoleReport", () => {
  it("shows one line per scenario and each failure with its decision record", () => {
    const text = consoleReport([result("duvida", true), result("reabertura", false)], info);

    expect(text).toContain("✓ duvida");
    expect(text).toContain("✗ reabertura");
    expect(text).toContain("1/2 scenarios passed every run (50% of runs)");
    expect(text).toContain('✗ reabertura · turn 1: "Quero reabrir o INC-19877"');
    expect(text).toContain("called prepararReabertura: expected called · got consultarChamado");
    expect(text).toContain("Decision: reabrir_chamado");
    expect(text).toContain("Tools: consultarChamado INC-19877 (ok)");
    expect(text).toContain("Rules: enforced R7 · cited R5");
    expect(text).not.toContain("✗ duvida");
  });

  it("shows pass rates when scenarios repeat", () => {
    const text = consoleReport([result("a", true, 1), result("a", false, 2)], {
      ...info,
      repeat: 2,
    });
    expect(text).toContain("1/2 runs");
    expect(text).toContain("✗ a · run 2 · turn 1");
  });
});

describe("markdownReport", () => {
  it("has the model, the date, a table with usage and the failures", () => {
    const text = markdownReport([result("reabertura", false)], info);

    expect(text).toContain("# Evals: openai/gpt-5.5, 2026-10-29");
    expect(text).toContain(
      "| `reabertura` | Cenário reabertura | R5 | ✗ failed | 1/2 | 2 | 1,000 (600) | 80 | 1.5 s |",
    );
    expect(text).toContain("### reabertura · turn 1");
    expect(text).toContain("## Analysis");
  });

  it("says how to run it again, filters included", () => {
    const text = markdownReport([result("vpn", true)], { ...info, scenarios: ["vpn"] });
    expect(text).toContain("Run with `pnpm eval --model openai/gpt-5.5 --scenario vpn`");
    expect(text).toContain("None.\n\n## Analysis");
  });
});
