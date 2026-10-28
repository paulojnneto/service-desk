import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { failureOf, servicesFrom, ticketSummary } from "./shared";

// Read-only tools: the help center and the employee's own tickets. The requester is the
// session's person, fixed in the services; no input can name someone else (R7).

export const buscarNaCentral = createTool({
  id: "buscar-na-central",
  description:
    "Busca artigos na central de ajuda de TI. Use antes de responder dúvidas e antes de abrir um chamado: o artigo pode resolver o problema. Confira se o artigo vale para o caso (por exemplo, a versão do Windows).",
  inputSchema: z.object({ pergunta: z.string().min(2).max(300) }),
  execute: async ({ pergunta }, context) => {
    try {
      const articles = await servicesFrom(context).tickets.searchArticles(pergunta);
      return {
        artigos: articles.map((a) => ({ id: a.id, titulo: a.title, texto: a.body })),
      };
    } catch (error) {
      return failureOf(error);
    }
  },
});

export const listarMeusChamados = createTool({
  id: "listar-meus-chamados",
  description:
    "Lista os chamados do funcionário que está conversando, com status, prazo e se está vencido. Use para saber o status sem o número, antes de abrir um chamado (para evitar duplicidade) e antes de adicionar informação.",
  inputSchema: z.object({ escopo: z.enum(["abertos", "todos"]).default("abertos") }),
  execute: async ({ escopo }, context) => {
    try {
      const tickets = await servicesFrom(context).tickets.list(
        escopo === "abertos" ? "open" : "all",
      );
      return { chamados: tickets.map(ticketSummary) };
    } catch (error) {
      return failureOf(error);
    }
  },
});

export const consultarChamado = createTool({
  id: "consultar-chamado",
  description:
    "Consulta um chamado do funcionário pelo número (por exemplo INC-20311), com descrição, histórico, prazo e se está vencido. Chamados de outras pessoas não são encontrados.",
  inputSchema: z.object({ numero: z.string().min(3).max(20) }),
  execute: async ({ numero }, context) => {
    try {
      const ticket = await servicesFrom(context).tickets.get(numero.trim().toUpperCase());
      return {
        chamado: {
          ...ticketSummary(ticket),
          descricao: ticket.description,
          historico: (ticket.events ?? []).map((e) => ({
            tipo: e.kind,
            em: e.at,
            mensagem: e.message,
          })),
        },
      };
    } catch (error) {
      return failureOf(error);
    }
  },
});
