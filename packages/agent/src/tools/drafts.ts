import { createTool } from "@mastra/core/tools";
import {
  Category,
  dueAt,
  Impact,
  isOpenStatus,
  priorityFor,
  TicketType,
  Urgency,
} from "@nexo/shared";
import { z } from "zod";
import { failureOf, isClosedStatus, servicesFrom } from "./shared";

// Draft tools (stage 6 PRD, S-06.4 to S-06.9). They only prepare: the ticket is written
// when the employee presses "Confirmar", by the API. No tool here can write a ticket.

const CONFIRM_NOTE =
  "Rascunho salvo e mostrado ao funcionário num card com todos os campos. Não repita os campos no texto: em uma frase, peça para ele conferir e clicar em Confirmar; nada foi criado ainda.";

export const prepararChamado = createTool({
  id: "preparar-chamado",
  description:
    "Prepara o rascunho de um chamado novo. Só use depois de consultar os chamados abertos e a central de ajuda, e quando souber quem está sendo afetado (impacto) e se há algo parado ou um compromisso em risco (urgência); se não souber, pergunte antes. A prioridade é calculada pelo sistema. Se a resposta trouxer possíveis duplicados do mesmo problema, prefira adicionar informação ao chamado existente.",
  inputSchema: z.object({
    tipo: TicketType.describe(
      "INC quando algo parou ou não funciona; REQ para acesso, equipamento ou software",
    ),
    titulo: z.string().min(3).max(120),
    descricao: z.string().min(10).max(2000),
    categoria: Category,
    impacto: Impact.describe("so_eu, equipe ou empresa"),
    urgencia: Urgency.describe(
      "parado (não consegue trabalhar), compromisso_hoje, contornavel (há alternativa) ou sem_urgencia",
    ),
  }),
  execute: async (input, context) => {
    const services = servicesFrom(context);
    try {
      // The duplicate check always runs, whatever the model decided before (R4).
      const open = await services.tickets.list("open");
      const duplicates = open
        .filter((t) => t.category === input.categoria)
        .map((t) => ({ number: t.number, title: t.title, status: t.status }));
      const priority = priorityFor(input.impacto, input.urgencia);
      const draft = await services.drafts.prepare({
        kind: "create",
        fields: {
          type: input.tipo,
          title: input.titulo,
          description: input.descricao,
          category: input.categoria,
          impact: input.impacto,
          urgency: input.urgencia,
          priority,
          dueAt: dueAt(priority, services.now()).toISOString(),
        },
        duplicates,
      });
      return { rascunho: draft, possiveisDuplicados: duplicates, aviso: CONFIRM_NOTE };
    } catch (error) {
      return failureOf(error);
    }
  },
});

export const prepararAtualizacao = createTool({
  id: "preparar-atualizacao",
  description:
    "Prepara o rascunho de uma informação nova para um chamado aberto do funcionário. Use também quando ele quiser abrir um chamado para um problema que já tem chamado aberto (regra de não duplicar).",
  inputSchema: z.object({
    numero: z.string().min(3).max(20),
    mensagem: z.string().min(1).max(2000),
  }),
  execute: async ({ numero, mensagem }, context) => {
    const services = servicesFrom(context);
    try {
      const ticket = await services.tickets.get(numero.trim().toUpperCase());
      if (!isOpenStatus(ticket.status)) {
        return {
          permitido: false,
          motivo: isClosedStatus(ticket.status)
            ? "O chamado já está resolvido ou fechado. Se foi resolvido há até 7 dias, ele pode ser reaberto."
            : "O chamado não está aberto.",
        };
      }
      const draft = await services.drafts.prepare({
        kind: "update",
        ticketNumber: ticket.number,
        fields: { message: mensagem },
      });
      return { rascunho: draft, aviso: CONFIRM_NOTE };
    } catch (error) {
      return failureOf(error);
    }
  },
});

export const prepararReabertura = createTool({
  id: "preparar-reabertura",
  description:
    "Prepara o rascunho para reabrir um chamado resolvido do funcionário. Chame para qualquer pedido de reabertura, mesmo de um chamado antigo: esta ferramenta confere o prazo de 7 dias, não decida pela data. Para os que não podem ser reabertos, a resposta explica o motivo e você deve oferecer um chamado novo que cite o antigo.",
  inputSchema: z.object({
    numero: z.string().min(3).max(20),
    motivo: z.string().min(1).max(2000),
  }),
  execute: async ({ numero, motivo }, context) => {
    const services = servicesFrom(context);
    try {
      const ticket = await services.tickets.get(numero.trim().toUpperCase());
      if (!ticket.canReopen) {
        return {
          permitido: false,
          motivo:
            ticket.status === "resolvido"
              ? "O chamado foi resolvido há mais de 7 dias e não pode ser reaberto (regra R5)."
              : "Só chamados resolvidos podem ser reabertos.",
        };
      }
      const draft = await services.drafts.prepare({
        kind: "reopen",
        ticketNumber: ticket.number,
        fields: { reason: motivo },
      });
      return { rascunho: draft, aviso: CONFIRM_NOTE };
    } catch (error) {
      return failureOf(error);
    }
  },
});

export const descartarRascunho = createTool({
  id: "descartar-rascunho",
  description:
    "Descarta o rascunho que está aguardando confirmação, quando o funcionário desistir.",
  inputSchema: z.object({}),
  execute: async (_input, context) => ({
    descartado: await servicesFrom(context).drafts.discard(),
  }),
});
