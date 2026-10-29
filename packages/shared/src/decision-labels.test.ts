import { describe, expect, it } from "vitest";
import {
  ACTION_LABELS,
  CONFIDENCE_LABELS,
  INTENT_LABELS,
  OUTCOME_LABELS,
  RULE_LABELS,
  TOOL_LABELS,
  toolLabel,
} from "./decision-labels";
import {
  Confidence,
  DecisionAction,
  enforcedRulesOf,
  Intent,
  RuleId,
  ToolName,
  ToolOutcome,
} from "./decisions";

describe("decision labels", () => {
  it.each([
    ["intent", Intent.options, INTENT_LABELS],
    ["action", DecisionAction.options, ACTION_LABELS],
    ["outcome", ToolOutcome.options, OUTCOME_LABELS],
    ["rule", RuleId.options, RULE_LABELS],
  ] as const)("has a label for every %s, with no codes", (_, values, labels) => {
    for (const value of values) {
      const label = (labels as Record<string, string>)[value];
      expect(label?.trim()).toBeTruthy();
      expect(label).not.toMatch(/_|R\d/);
    }
  });

  it("gives every confidence level a word and a meaning", () => {
    for (const level of Confidence.options) {
      expect(CONFIDENCE_LABELS[level].word).toBeTruthy();
      expect(CONFIDENCE_LABELS[level].meaning).toMatch(/\.$/);
    }
  });

  it("names every tool with its subject, and never with the tool's code", () => {
    for (const name of ToolName.options) {
      expect(TOOL_LABELS[name]("INC-20311")).not.toContain(name);
      expect(TOOL_LABELS[name]()).not.toContain("undefined");
    }
    expect(toolLabel("consultarChamado", "INC-20311")).toBe("Consultou o INC-20311");
    expect(toolLabel("criarChamado", "INC-20312")).toBe("Criou o INC-20312");
    expect(toolLabel("ferramentaAntiga")).toBe("ferramentaAntiga");
  });
});

describe("enforcedRulesOf", () => {
  it("lists the rules the tools guarantee, once each, in Annex A order", () => {
    const rules = enforcedRulesOf([
      { name: "prepararChamado", outcome: "ok" },
      { name: "listarMeusChamados", outcome: "ok" },
      { name: "consultarChamado", outcome: "ok" },
    ]);
    expect(rules).toEqual(["R3", "R4", "R7", "R9"]);
  });

  it("depends on the outcome where the guarantee does", () => {
    expect(enforcedRulesOf([{ name: "prepararReabertura", outcome: "recusado" }])).toEqual([
      "R5",
      "R7",
    ]);
    expect(enforcedRulesOf([{ name: "prepararChamado", outcome: "indisponivel" }])).toEqual([]);
    expect(enforcedRulesOf([{ name: "consultarChamado", outcome: "nao_encontrado" }])).toEqual([
      "R7",
    ]);
  });

  it("keeps the extra rules and ignores unknown tools", () => {
    expect(enforcedRulesOf([{ name: "ferramentaAntiga", outcome: "ok" }], ["R8"])).toEqual(["R8"]);
  });
});
