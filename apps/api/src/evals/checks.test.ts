import type { DecisionRecord, DraftView } from "@nexo/shared";
import { describe, expect, it } from "vitest";
import { runChecks } from "./checks";
import type { Observation } from "./types";

const decision: DecisionRecord = {
  intent: "abrir_chamado",
  action: "preparou_rascunho",
  confidence: "alta",
  rationale: "A pessoa precisa da VPN para a reunião das 14h.",
  rules: ["R1"],
  enforcedRules: ["R3", "R4", "R9"],
  tools: [
    { name: "listarMeusChamados", outcome: "ok", subject: "abertos" },
    { name: "prepararChamado", outcome: "ok" },
  ],
  source: "agent",
  registered: true,
};

const draft = {
  id: "d1",
  number: "D-381",
  kind: "create",
  status: "pending",
  ticketNumber: null,
  fields: { type: "INC", category: "Rede e VPN", priority: "alta" },
} as unknown as DraftView;

function observed(change: Partial<Observation> = {}): Observation {
  return {
    said: "…",
    reply: "Coloquei prioridade Alta por causa da reunião. Confira o rascunho.",
    decision,
    tools: [
      { name: "listarMeusChamados", input: {}, output: {} },
      { name: "prepararChamado", input: {}, output: {} },
    ],
    question: null,
    state: "with_agent",
    newDrafts: [draft],
    newHandoffs: [],
    ticketsWritten: [],
    ...change,
  };
}

const failed = (results: ReturnType<typeof runChecks>) =>
  results.filter((r) => !r.passed).map((r) => r.check);

describe("runChecks", () => {
  it("passes a turn that decided as expected, accepting any listed value", () => {
    const results = runChecks(
      {
        intent: ["abrir_chamado", "adicionar_informacao"],
        action: "preparou_rascunho",
        toolsCalled: ["listarMeusChamados"],
        toolsNotCalled: ["transferirParaAnalista"],
        enforced: ["R3", "R9"],
        draft: {
          kind: "create",
          type: "INC",
          category: "Rede e VPN",
          priority: ["alta", "critica"],
        },
        handoff: "none",
        ticketsWritten: 0,
        replyIncludes: [["prioridade alta", "Crítica"]],
      },
      observed(),
    );

    expect(failed(results)).toEqual([]);
  });

  it("says what was expected and what happened", () => {
    const [result] = runChecks({ action: "transferiu" }, observed());

    expect(result).toEqual({
      check: "action",
      passed: false,
      expected: "transferiu",
      actual: "preparou_rascunho",
    });
  });

  it("never passes a field the record does not have", () => {
    expect(runChecks({ intent: "duvida" }, observed({ decision: null }))[0]).toMatchObject({
      passed: false,
      actual: "absent",
    });
    expect(runChecks({ handoff: { reason: "caso_critico" } }, observed())[0]).toMatchObject({
      passed: false,
      actual: "none",
    });
  });

  it("checks text ignoring case and accents, in the reply and the rationale", () => {
    const results = runChecks(
      { replyIncludes: [["reuniao"]], replyExcludes: ["vpn", "Carla"] },
      observed(),
    );

    expect(failed(results)).toEqual(["reply and rationale leave out"]);
    expect(results.at(-1)?.actual).toBe("vpn");
  });

  it("passes a lookup that answered not found, or none at all", () => {
    const outcome = { tool: "consultarChamado", outcome: "nao_encontrado" } as const;
    const lookedUp = {
      ...decision,
      tools: [{ name: "consultarChamado", outcome: "nao_encontrado" as const }],
    };

    expect(failed(runChecks({ toolOutcome: outcome }, observed({ decision: lookedUp })))).toEqual(
      [],
    );
    expect(failed(runChecks({ toolOutcome: outcome }, observed()))).toEqual([]);
    const leaked = { ...decision, tools: [{ name: "consultarChamado", outcome: "ok" as const }] };
    expect(failed(runChecks({ toolOutcome: outcome }, observed({ decision: leaked })))).toEqual([
      "consultarChamado outcome",
    ]);
  });

  it("checks the options of a question and the ticket picker", () => {
    const options = observed({
      question: { kind: "options", question: "?", options: ["Falar com um analista", "Não"] },
    });
    expect(failed(runChecks({ question: { optionsInclude: ["analista"] } }, options))).toEqual([]);
    expect(failed(runChecks({ question: { tickets: true } }, options))).toEqual(["ticket picker"]);
  });

  it("passes 'one of' when any branch passes, and lists what failed in each otherwise", () => {
    const anyOf = [
      { label: "update draft", expect: { draft: { kind: "update" as const } } },
      { label: "a question", expect: { question: { optionsInclude: ["INC-20311"] } } },
    ];

    const [result] = runChecks({ anyOf }, observed());
    expect(result?.passed).toBe(false);
    expect(result?.actual).toContain("update draft: draft kind = create");

    expect(
      runChecks({ anyOf }, observed({ newDrafts: [{ ...draft, kind: "update" } as DraftView] }))[0],
    ).toMatchObject({ passed: true, actual: "update draft" });
  });

  it("fails the turn when it did not run", () => {
    expect(runChecks({ intent: "duvida" }, observed({ error: "model unavailable" }))).toEqual([
      { check: "turn ran", passed: false, expected: "a stored reply", actual: "model unavailable" },
    ]);
  });
});
