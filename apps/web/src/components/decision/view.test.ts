import type { DecisionRecord } from "@nexo/shared";
import { describe, expect, it } from "vitest";
import { confidenceSummary, decisionView } from "./view";

const draftReply: DecisionRecord = {
  intent: "abrir_chamado",
  action: "preparou_rascunho",
  confidence: "alta",
  rationale: "Com quem é afetado e a urgência, o sistema calcula a prioridade.",
  rules: ["R1", "R2", "R3"],
  enforcedRules: ["R3", "R4", "R9"],
  tools: [
    { name: "listarMeusChamados", outcome: "ok", subject: "abertos" },
    { name: "buscarNaCentral", outcome: "indisponivel", subject: "VPN erro 809" },
    { name: "prepararChamado", outcome: "ok" },
  ],
  source: "agent",
  registered: true,
};

describe("decisionView", () => {
  it("puts every part of the record in plain Portuguese, in order", () => {
    expect(decisionView(draftReply)).toEqual({
      kind: "recorded",
      note: null,
      understood: "Quer abrir um chamado",
      did: "Montou um rascunho para confirmação",
      confidence: {
        level: "alta",
        word: "alta",
        meaning: "Entendeu o pedido e tinha o que precisava.",
      },
      rationale: "Com quem é afetado e a urgência, o sistema calcula a prioridade.",
      tools: [
        {
          key: "0-listarMeusChamados",
          label: "Listou os chamados abertos da pessoa",
          outcome: "ok",
          outcomeLabel: "ok",
        },
        {
          key: "1-buscarNaCentral",
          label: 'Buscou "VPN erro 809" na central de ajuda',
          outcome: "indisponivel",
          outcomeLabel: "sistema de chamados fora do ar",
        },
        {
          key: "2-prepararChamado",
          label: "Montou o rascunho de um chamado novo",
          outcome: "ok",
          outcomeLabel: "ok",
        },
      ],
      enforced: [
        { code: "R3", title: "Rascunho e confirmação" },
        { code: "R4", title: "Sem chamados duplicados" },
        { code: "R9", title: "Prioridade e prazos" },
      ],
      // R3 is already guaranteed by the system, so it is not repeated here.
      cited: [
        { code: "R1", title: "Tipo: incidente ou requisição" },
        { code: "R2", title: "Categoria" },
      ],
    });
  });

  it("marks the server's decisions and shows no model confidence for them", () => {
    const view = decisionView({
      intent: "abrir_chamado",
      action: "criou_chamado",
      confidence: "alta",
      rationale: "A pessoa confirmou o rascunho D-381.",
      rules: [],
      enforcedRules: ["R3", "R4", "R9"],
      tools: [{ name: "criarChamado", outcome: "ok", subject: "INC-20312" }],
      source: "server",
      registered: true,
    });

    expect(view).toMatchObject({
      note: "Decidido pelo sistema, sem o modelo, a partir do botão que a pessoa usou.",
      did: "Criou o chamado",
      confidence: null,
      tools: [{ label: "Criou o INC-20312" }],
    });
  });

  it("says when the model did not register its decision, without its fallback text", () => {
    const view = decisionView({
      ...draftReply,
      intent: "outro",
      confidence: "baixa",
      rationale: "O modelo não registrou a decisão.",
      rules: [],
      registered: false,
    });

    expect(view).toMatchObject({
      note: "O agente não registrou a decisão.",
      rationale: null,
      confidence: { level: "baixa" },
    });
  });

  it("says when a reply has no record at all", () => {
    expect(decisionView(undefined)).toEqual({
      kind: "none",
      note: "Sem registro de decisão para esta resposta.",
    });
  });

  it("keeps unknown tools and old records readable", () => {
    const old = {
      ...draftReply,
      enforcedRules: undefined,
      tools: [{ name: "ferramentaAntiga", outcome: "ok" }],
    };

    const view = decisionView(old as unknown as DecisionRecord);
    expect(view).toMatchObject({ tools: [{ label: "ferramentaAntiga" }], enforced: [] });
  });
});

describe("confidenceSummary", () => {
  it("shows only média and baixa, and never for the server's decisions", () => {
    expect(confidenceSummary(draftReply)).toBeNull();
    expect(confidenceSummary({ ...draftReply, confidence: "media" })).toEqual({
      level: "media",
      text: "confiança média",
    });
    expect(confidenceSummary({ ...draftReply, confidence: "baixa" })?.text).toBe("confiança baixa");
    expect(confidenceSummary({ ...draftReply, confidence: "baixa", source: "server" })).toBeNull();
    expect(confidenceSummary(undefined)).toBeNull();
  });
});
