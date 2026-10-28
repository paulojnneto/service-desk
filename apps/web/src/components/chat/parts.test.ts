import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { actionLabels, cardsOf, chosenIndex, isWaiting, waitingQuestion } from "./parts";

let ids = 0;

function tool(name: string, input: unknown, output?: unknown, state = "output-available") {
  return {
    type: `tool-${name}`,
    toolCallId: `call-${++ids}`,
    state,
    input,
    ...(output === undefined ? {} : { output }),
  };
}

function agent(...parts: unknown[]): UIMessage {
  return { id: `m-${++ids}`, role: "assistant", parts: parts as UIMessage["parts"] };
}

function employee(text: string): UIMessage {
  return { id: `m-${++ids}`, role: "user", parts: [{ type: "text", text }] };
}

const affected = {
  kind: "options",
  question: "Quem está sendo afetado?",
  options: ["Só eu", "Minha equipe", "Toda a empresa", "Não sei"],
};

const askAffected = () =>
  agent(
    { type: "text", text: "Vou abrir um chamado." },
    tool(
      "perguntar",
      { pergunta: affected.question, opcoes: affected.options },
      { pergunta: affected },
    ),
  );

describe("cardsOf", () => {
  it("makes a card for each ticket, question and draft, in order", () => {
    const message = agent(
      tool("consultarChamado", { numero: "inc-20311" }, { chamado: { numero: "INC-20311" } }),
      tool("perguntar", { pergunta: "?", opcoes: ["a", "b"] }, { pergunta: affected }),
      tool("prepararAtualizacao", { numero: "INC-20311" }, { rascunho: { id: "d1" } }),
      tool("registrarDecisao", {}, { registrado: true }),
    );

    expect(cardsOf(message).map((c) => [c.kind, c.state])).toEqual([
      ["ticket", "ready"],
      ["question", "ready"],
      ["draft", "ready"],
    ]);
  });

  it("shows a placeholder while a tool runs and an error when the service is down", () => {
    const message = agent(
      tool("consultarChamado", { numero: "INC-20311" }, undefined, "input-available"),
      tool("perguntar", { pergunta: "Qual?", chamados: ["INC-20311"] }, { indisponivel: true }),
    );

    expect(cardsOf(message)).toMatchObject([
      { kind: "ticket", state: "loading", number: "INC-20311" },
      { kind: "question", state: "unavailable", tickets: true },
    ]);
  });

  it("has no card for a ticket that was not found or a draft that was refused", () => {
    const message = agent(
      tool("consultarChamado", { numero: "REQ-10439" }, { encontrado: false }),
      tool("prepararReabertura", { numero: "INC-19877" }, { permitido: false, motivo: "..." }),
    );

    expect(cardsOf(message)).toEqual([]);
  });
});

describe("actionLabels", () => {
  it("names what was looked at, as in the prototype", () => {
    const message = agent(
      tool("consultarChamado", { numero: "INC-20311" }, { chamado: {} }),
      tool("perguntar", { pergunta: "?" }, { pergunta: affected }),
    );

    expect(actionLabels(message).map((l) => l.label)).toEqual([
      "consultou o INC-20311",
      "calculou o prazo",
    ]);
  });

  it("never claims a draft that was not made", () => {
    const message = agent(tool("prepararChamado", {}, { indisponivel: true }));

    expect(actionLabels(message).map((l) => l.label)).toEqual(["classificou a prioridade"]);
  });

  it("marks running tools as not done", () => {
    const message = agent(tool("listarMeusChamados", {}, undefined, "input-available"));

    expect(actionLabels(message)).toMatchObject([
      { label: "consultou seus chamados", done: false },
    ]);
  });
});

describe("questions", () => {
  it("waits only for the question of the last message", () => {
    const asked = askAffected();

    expect(waitingQuestion([employee("VPN"), asked])).toEqual(affected);
    expect(isWaiting([employee("VPN"), asked], asked.id)).toBe(true);
    expect(waitingQuestion([asked, employee("Só eu")])).toBeNull();
    expect(isWaiting([asked, employee("Só eu")], asked.id)).toBe(false);
  });

  it("finds the option the employee picked, and none for a typed answer", () => {
    const asked = askAffected();

    expect(chosenIndex([asked, employee("Toda a empresa")], asked.id)).toBe(2);
    expect(chosenIndex([asked, employee("só a minha máquina")], asked.id)).toBeNull();
    expect(chosenIndex([asked], asked.id)).toBeNull();
  });

  it("matches a picked ticket by the text it sent", () => {
    const picker = {
      kind: "tickets",
      question: "Sobre qual deles?",
      tickets: [
        {
          number: "INC-20311",
          title: "Notebook lento",
          status: "aguardando_analista",
          openedAt: "",
        },
        { number: "REQ-10442", title: "Segundo monitor", status: "aprovado", openedAt: "" },
      ],
    };
    const asked = agent(tool("perguntar", { chamados: [] }, { pergunta: picker }));

    expect(chosenIndex([asked, employee("REQ-10442 · Segundo monitor")], asked.id)).toBe(1);
  });
});
