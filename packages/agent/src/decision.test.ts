import { describe, expect, it } from "vitest";
import { buildDecisionRecord } from "./decision";

const decided = (input: Record<string, unknown>) => ({
  type: "tool-registrarDecisao",
  state: "output-available",
  input,
  output: { registrado: true },
});
const tool = (name: string, output: unknown, state = "output-available", input = {}) => ({
  type: `tool-${name}`,
  state,
  input,
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
      { name: "listarMeusChamados", outcome: "ok", subject: "abertos" },
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

  it("marks the record as the agent's, and as registered only when the model called it", () => {
    expect(buildDecisionRecord([decided(registered)])).toMatchObject({
      source: "agent",
      registered: true,
    });
    expect(buildDecisionRecord([text])).toMatchObject({ source: "agent", registered: false });
  });

  it("records a question with options as perguntou, below low confidence", () => {
    const question = tool("perguntar", { pergunta: {} }, "output-available", {
      pergunta: "Qual a urgência?",
      opcoes: ["Estou parado", "Sem urgência"],
    });

    expect(buildDecisionRecord([question, decided(registered)]).action).toBe("perguntou");
    expect(
      buildDecisionRecord([question, decided({ ...registered, confianca: "baixa" })]).action,
    ).toBe("pediu_esclarecimento");
    expect(
      buildDecisionRecord([tool("listarMeusChamados", { chamados: [] }), question]).action,
    ).toBe("consultou_chamados");
  });
});

describe("buildDecisionRecord, subjects and enforced rules", () => {
  it("keeps one short, safe subject per tool", () => {
    const record = buildDecisionRecord([
      tool("consultarChamado", { chamado: {} }, "output-available", { numero: " inc-20311 " }),
      tool("buscarNaCentral", { artigos: [] }, "output-available", { pergunta: "x".repeat(300) }),
      tool("listarMeusChamados", { chamados: [] }, "output-available", { escopo: "todos" }),
      tool("perguntar", { pergunta: {} }, "output-available", {
        pergunta: "Qual deles?",
        chamados: ["INC-20311"],
      }),
      tool("transferirParaAnalista", { transferido: true }, "output-available", {
        resumo: "Ana está sem VPN desde ontem e tem reunião às 14h.",
      }),
    ]);

    expect(record.tools.map((t) => t.subject)).toEqual([
      "INC-20311",
      "x".repeat(80),
      "todos",
      "chamados",
      undefined,
    ]);
  });

  it("lists the rules a creation draft enforces, even when the model cites none", () => {
    const record = buildDecisionRecord([
      tool("listarMeusChamados", { chamados: [] }),
      tool("buscarNaCentral", { artigos: [] }),
      tool("prepararChamado", { rascunho: {} }),
      decided({ ...registered, regras: [] }),
    ]);

    expect(record.rules).toEqual([]);
    expect(record.enforcedRules).toEqual(["R3", "R4", "R7", "R9"]);
  });

  it("records a refused reopening with R5 enforced (INC-19877)", () => {
    const record = buildDecisionRecord([
      tool("prepararReabertura", { permitido: false, motivo: "..." }, "output-available", {
        numero: "INC-19877",
        motivo: "O Outlook parou de novo.",
      }),
      decided({ ...registered, intencao: "reabrir_chamado", regras: [] }),
    ]);

    expect(record).toMatchObject({
      action: "recusou_reabertura",
      enforcedRules: ["R5", "R7"],
      tools: [{ name: "prepararReabertura", outcome: "recusado", subject: "INC-19877" }],
    });
  });

  it("enforces R7 for the ticket picker, whatever its outcome", () => {
    const picker = tool("perguntar", { indisponivel: true }, "output-available", {
      pergunta: "Qual deles?",
      chamados: ["INC-20311"],
    });
    expect(buildDecisionRecord([picker, decided(registered)]).enforcedRules).toEqual(["R7"]);
  });

  it("enforces R8 only for an out-of-scope turn that wrote nothing", () => {
    const outOfScope = decided({ ...registered, intencao: "fora_do_escopo", regras: [] });

    expect(buildDecisionRecord([outOfScope]).enforcedRules).toEqual(["R8"]);
    expect(
      buildDecisionRecord([tool("prepararChamado", { rascunho: {} }), outOfScope]).enforcedRules,
    ).not.toContain("R8");
    expect(buildDecisionRecord([decided(registered)]).enforcedRules).toEqual([]);
  });

  it("never enforces the rules of a tool that failed", () => {
    const record = buildDecisionRecord([
      tool("prepararChamado", { indisponivel: true }),
      tool("transferirParaAnalista", undefined, "output-error"),
      decided(registered),
    ]);
    expect(record.enforcedRules).toEqual([]);
  });
});
