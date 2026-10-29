import type { DraftView, Ticket } from "@nexo/shared";
import { describe, expect, it, vi } from "vitest";
import { requestContextFor, type AgentServices, type DraftInput } from "../context";
import {
  descartarRascunho,
  prepararAtualizacao,
  prepararChamado,
  prepararReabertura,
} from "./drafts";
import { transferirParaAnalista } from "./handoff";
import { perguntar } from "./question";
import { buscarNaCentral, consultarChamado, listarMeusChamados } from "./read";

const NOW = new Date("2026-10-28T13:00:00Z"); // Wednesday, 10:00 in São Paulo

function ticket(overrides: Partial<Ticket>): Ticket {
  return {
    number: "INC-20311",
    type: "INC",
    title: "Notebook lento",
    description: "Lentidão geral desde a atualização.",
    category: "Hardware",
    priority: "media",
    affected: "so_eu",
    status: "aguardando_analista",
    requesterId: "ana.souza",
    openedAt: NOW.toISOString(),
    lastUpdateAt: NOW.toISOString(),
    resolvedAt: null,
    dueAt: NOW.toISOString(),
    overdue: false,
    canReopen: false,
    ...overrides,
  };
}

const failing = (kind: string) => Object.assign(new Error(kind), { kind });

function fakeServices(tickets: Ticket[] = []) {
  const prepared: DraftInput[] = [];
  const services: AgentServices = {
    tickets: {
      list: vi.fn(async (scope) =>
        scope === "open"
          ? tickets.filter((t) => !["resolvido", "fechado"].includes(t.status))
          : tickets,
      ),
      get: vi.fn(async (number) => {
        const found = tickets.find((t) => t.number === number);
        if (!found) throw failing("not_found");
        return found;
      }),
      searchArticles: vi.fn(async () => [{ id: "a1", title: "VPN com erro 809", body: "..." }]),
    },
    drafts: {
      prepare: vi.fn(async (input) => {
        prepared.push(input);
        return { id: "d1", number: "D-381", status: "pending", ...input } as unknown as DraftView;
      }),
      discard: vi.fn(async () => true),
    },
    handoff: vi.fn(async () => true),
    now: () => NOW,
  };
  const context = {
    requestContext: requestContextFor({ userId: "ana.souza", firstName: "Ana", services }),
  };
  return { services, prepared, context };
}

// Mastra's execute takes (input, context); tests call it directly with a fake context.
type Executable = { execute?: (input: never, context: never) => Promise<unknown> };
function run(tool: Executable, input: unknown, context: unknown) {
  return tool.execute!(input as never, context as never) as Promise<Record<string, unknown>>;
}

describe("read tools", () => {
  it("search the help center and list the employee's open tickets", async () => {
    const { context } = fakeServices([
      ticket({}),
      ticket({ number: "INC-1", status: "resolvido" }),
    ]);

    const articles = await run(buscarNaCentral, { pergunta: "vpn 809" }, context);
    const list = await run(listarMeusChamados, { escopo: "abertos" }, context);

    expect(articles).toMatchObject({ artigos: [{ titulo: "VPN com erro 809" }] });
    expect((list.chamados as unknown[]).map((t) => (t as { numero: string }).numero)).toEqual([
      "INC-20311",
    ]);
  });

  it("answer a ticket that is not the employee's like one that does not exist", async () => {
    const { context } = fakeServices([ticket({})]);

    expect(await run(consultarChamado, { numero: "req-10439" }, context)).toEqual({
      encontrado: false,
    });
  });

  it("report the ticket service as unavailable instead of failing the turn", async () => {
    const { services, context } = fakeServices();
    services.tickets.list = async () => {
      throw failing("unavailable");
    };

    expect(await run(listarMeusChamados, { escopo: "abertos" }, context)).toEqual({
      indisponivel: true,
    });
  });
});

describe("prepararChamado", () => {
  const vpn = {
    tipo: "INC",
    titulo: "VPN não conecta no notebook — erro 809",
    descricao: "Desde ontem o notebook (Windows 11) não conecta na VPN e mostra o erro 809.",
    categoria: "Rede e VPN",
    impacto: "so_eu",
    urgencia: "compromisso_hoje",
  };

  it("computes the priority and deadline in code and stores a draft", async () => {
    const { prepared, context } = fakeServices();

    const result = await run(prepararChamado, vpn, context);

    expect(prepared[0]).toMatchObject({
      kind: "create",
      fields: { priority: "alta", impact: "so_eu", urgency: "compromisso_hoje" },
      duplicates: [],
    });
    // High: 4 business hours from 10:00 on a Wednesday → 14:00 São Paulo (17:00 UTC).
    expect((prepared[0] as { fields: { dueAt: string } }).fields.dueAt).toBe(
      "2026-10-28T17:00:00.000Z",
    );
    expect(result.aviso).toContain("nada foi criado");
  });

  it("always runs the duplicate check and lists open tickets of the same category", async () => {
    const { services, prepared, context } = fakeServices([
      ticket({ number: "INC-20309", title: "VPN cai", category: "Rede e VPN" }),
      ticket({ number: "INC-20311", category: "Hardware" }),
    ]);

    const result = await run(prepararChamado, vpn, context);

    expect(services.tickets.list).toHaveBeenCalledWith("open");
    expect(result.possiveisDuplicados).toEqual([
      { number: "INC-20309", title: "VPN cai", status: "aguardando_analista" },
    ]);
    expect(prepared[0]).toMatchObject({ duplicates: [{ number: "INC-20309" }] });
  });

  it("rejects a draft without the R3 fields", async () => {
    const { context } = fakeServices();

    const result = await run(prepararChamado, { ...vpn, categoria: "Café" }, context);

    expect(result).toHaveProperty("error", true);
  });
});

describe("update and reopening drafts", () => {
  it("prepare an update only for an open ticket of the employee", async () => {
    const { prepared, context } = fakeServices([
      ticket({}),
      ticket({ number: "INC-19410", status: "resolvido" }),
    ]);

    const ok = await run(
      prepararAtualizacao,
      { numero: "inc-20311", mensagem: "Trava no Excel." },
      context,
    );
    const closed = await run(prepararAtualizacao, { numero: "INC-19410", mensagem: "x" }, context);
    const other = await run(prepararAtualizacao, { numero: "REQ-10439", mensagem: "x" }, context);

    expect(ok).toHaveProperty("rascunho");
    expect(prepared).toEqual([
      { kind: "update", ticketNumber: "INC-20311", fields: { message: "Trava no Excel." } },
    ]);
    expect(closed).toMatchObject({ permitido: false });
    expect(other).toEqual({ encontrado: false });
  });

  it("prepare a reopening within 7 days and refuse an older one with the reason", async () => {
    const { prepared, context } = fakeServices([
      ticket({ number: "INC-20150", status: "resolvido", canReopen: true }),
      ticket({ number: "INC-19877", status: "resolvido", canReopen: false }),
    ]);

    await run(prepararReabertura, { numero: "INC-20150", motivo: "Voltou a bloquear." }, context);
    const refused = await run(prepararReabertura, { numero: "INC-19877", motivo: "x" }, context);

    expect(prepared).toHaveLength(1);
    expect(refused).toMatchObject({ permitido: false });
    expect(refused.motivo).toContain("7 dias");
  });

  it("discard the waiting draft", async () => {
    const { services, context } = fakeServices();

    expect(await run(descartarRascunho, {}, context)).toEqual({ descartado: true });
    expect(services.drafts.discard).toHaveBeenCalled();
  });
});

describe("transferirParaAnalista", () => {
  it("hands off with the trigger, the summary and the ticket", async () => {
    const { services, context } = fakeServices();

    const result = await run(
      transferirParaAnalista,
      {
        gatilho: "chamado_vencido",
        resumo: "INC-20311 sem atualização há 6 dias.",
        numero: "inc-20311",
      },
      context,
    );

    expect(result).toEqual({ transferido: true });
    expect(services.handoff).toHaveBeenCalledWith({
      trigger: "chamado_vencido",
      summary: "INC-20311 sem atualização há 6 dias.",
      ticketNumber: "INC-20311",
    });
  });

  it("refuses when the conversation is already with the service desk", async () => {
    const { services, context } = fakeServices();
    vi.mocked(services.handoff).mockResolvedValueOnce(false);

    const result = await run(
      transferirParaAnalista,
      { gatilho: "pedido_do_funcionario", resumo: "Ana pediu um analista de novo." },
      context,
    );

    expect(result).toMatchObject({ transferido: false, permitido: false });
  });
});

describe("perguntar", () => {
  it("returns the question with its options and writes nothing", async () => {
    const { services, context } = fakeServices();

    const result = await run(
      perguntar,
      { pergunta: "Quem está sendo afetado?", opcoes: ["Só eu", "Minha equipe"] },
      context,
    );

    expect(result).toEqual({
      pergunta: {
        kind: "options",
        question: "Quem está sendo afetado?",
        options: ["Só eu", "Minha equipe"],
      },
    });
    expect(services.drafts.prepare).not.toHaveBeenCalled();
  });

  it("keeps only the employee's open tickets in the picker, in the given order", async () => {
    const { context } = fakeServices([
      ticket({ number: "INC-20311", title: "Notebook lento" }),
      ticket({ number: "REQ-10442", title: "Segundo monitor", status: "aprovado" }),
      ticket({ number: "INC-20150", status: "resolvido" }),
    ]);

    const result = await run(
      perguntar,
      // REQ-10439 is Carla's: the employee's list does not have it, so it is dropped (R7).
      {
        pergunta: "Sobre qual deles?",
        chamados: ["req-10442", "REQ-10439", "INC-20150", "INC-20311"],
      },
      context,
    );

    expect(result).toMatchObject({
      pergunta: {
        kind: "tickets",
        tickets: [
          { number: "REQ-10442", title: "Segundo monitor", status: "aprovado" },
          { number: "INC-20311", title: "Notebook lento" },
        ],
      },
    });
  });

  it("refuses both or neither of options and tickets, and reports no valid ticket", async () => {
    const { context } = fakeServices([ticket({})]);

    expect(await run(perguntar, { pergunta: "Qual?" }, context)).toMatchObject({
      permitido: false,
    });
    expect(
      await run(
        perguntar,
        { pergunta: "Qual?", opcoes: ["a", "b"], chamados: ["INC-20311"] },
        context,
      ),
    ).toMatchObject({ permitido: false });
    expect(await run(perguntar, { pergunta: "Qual?", chamados: ["REQ-10439"] }, context)).toEqual({
      encontrado: false,
    });
  });

  it("reports the ticket service as unavailable", async () => {
    const { services, context } = fakeServices();
    services.tickets.list = async () => {
      throw failing("unavailable");
    };

    expect(await run(perguntar, { pergunta: "Qual?", chamados: ["INC-20311"] }, context)).toEqual({
      indisponivel: true,
    });
  });
});

describe("services given to the agent", () => {
  it("offer no way to create, update or reopen a ticket", () => {
    const { services } = fakeServices();

    expect(Object.keys(services.tickets).sort()).toEqual(["get", "list", "searchArticles"]);
  });
});
