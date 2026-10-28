import { describe, expect, it } from "vitest";
import { buildDecisionRecord } from "./decision";

const decided = (input: Record<string, unknown>) => ({
  type: "tool-registrarDecisao",
  state: "output-available",
  input,
  output: { registrado: true },
});
const tool = (name: string, output: unknown, state = "output-available") => ({
  type: `tool-${name}`,
  state,
  input: {},
  output,
});
const text = { type: "text", text: "Pronto." };
const registered = {
  intencao: "abrir_chamado",
  confianca: "alta",
  justificativa: "Pediu um chamado para a VPN.",
  regras: ["R3", "R4"],
};

describe("buildDecisionRecord", () => {
  it("takes intent, confidence, rationale and rules from registrarDecisao", () => {
    const record = buildDecisionRecord([decided(registered), text]);

    expect(record).toMatchObject({
      intent: "abrir_chamado",
      confidence: "alta",
      rationale: "Pediu um chamado para a VPN.",
      rules: ["R3", "R4"],
      tools: [],
    });
  });

  it("derives the action from the tools that ran, in order of importance", () => {
    const record = buildDecisionRecord([
      tool("listarMeusChamados", { chamados: [] }),
      tool("buscarNaCentral", { artigos: [] }),
      tool("prepararChamado", { rascunho: {} }),
      decided(registered),
      text,
    ]);

    expect(record.action).toBe("preparou_rascunho");
    expect(record.tools).toEqual([
      { name: "listarMeusChamados", outcome: "ok" },
      { name: "buscarNaCentral", outcome: "ok" },
      { name: "prepararChamado", outcome: "ok" },
    ]);
  });

  it("maps tool outcomes", () => {
    const record = buildDecisionRecord([
      tool("consultarChamado", { encontrado: false }),
      tool("listarMeusChamados", { indisponivel: true }),
      tool("prepararReabertura", { permitido: false, motivo: "..." }),
      tool("buscarNaCentral", undefined, "output-error"),
    ]);

    expect(record.tools.map((t) => t.outcome)).toEqual([
      "nao_encontrado",
      "indisponivel",
      "recusado",
      "erro",
    ]);
    expect(record.action).toBe("recusou_reabertura");
  });

  it("never claims a transfer or a draft that did not succeed", () => {
    const record = buildDecisionRecord([
      tool("transferirParaAnalista", { indisponivel: true }),
      tool("prepararChamado", { indisponivel: true }),
      decided({ ...registered, intencao: "falar_com_analista" }),
    ]);

    expect(record.action).not.toBe("transferiu");
    expect(record.action).not.toBe("preparou_rascunho");
  });

  it("records a missing decision as such, with low confidence", () => {
    const record = buildDecisionRecord([tool("buscarNaCentral", { artigos: [] }), text]);

    expect(record).toMatchObject({
      intent: "outro",
      confidence: "baixa",
      rationale: "O modelo não registrou a decisão.",
      action: "respondeu_central",
    });
  });

  it("uses the intent and confidence when no tool ran", () => {
    const outOfScope = buildDecisionRecord([
      decided({ ...registered, intencao: "fora_do_escopo", regras: ["R8"] }),
    ]);
    const unclear = buildDecisionRecord([
      decided({ ...registered, intencao: "outro", confianca: "baixa" }),
    ]);

    expect(outOfScope.action).toBe("redirecionou");
    expect(unclear.action).toBe("pediu_esclarecimento");
  });
});
