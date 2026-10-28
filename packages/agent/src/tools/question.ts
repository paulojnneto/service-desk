import { createTool } from "@mastra/core/tools";
import {
  MAX_OPTION_LENGTH,
  MAX_OPTIONS,
  MAX_TICKET_CHOICES,
  type QuestionView,
} from "@nexo/shared";
import { z } from "zod";
import { failureOf, servicesFrom } from "./shared";

// Questions with known answers (stage 7 PRD, S-07.11). The tool writes nothing: the UI shows
// the question with quick-reply options or a ticket picker, and the employee's answer comes
// back as an ordinary message.

export const perguntar = createTool({
  id: "perguntar",
  description:
    "Faz uma pergunta com respostas conhecidas, que aparecem como botões para o funcionário. Use 'opcoes' para respostas curtas (por exemplo quem está sendo afetado: Só eu, Minha equipe, Toda a empresa, Não sei) ou 'chamados' com os números dos chamados abertos dele quando precisar saber de qual chamado ele fala. Use um dos dois, nunca ambos. Não repita a pergunta no texto da resposta: o texto só introduz, a pergunta aparece com os botões.",
  inputSchema: z.object({
    pergunta: z.string().min(3).max(200),
    opcoes: z.array(z.string().min(1).max(MAX_OPTION_LENGTH)).min(2).max(MAX_OPTIONS).optional(),
    chamados: z.array(z.string().min(3).max(20)).min(1).max(MAX_TICKET_CHOICES).optional(),
  }),
  execute: async ({ pergunta, opcoes, chamados }, context) => {
    if (Boolean(opcoes) === Boolean(chamados)) {
      return { permitido: false, motivo: "Informe 'opcoes' ou 'chamados', um dos dois." };
    }
    if (opcoes) {
      const view: QuestionView = { kind: "options", question: pergunta, options: opcoes };
      return { pergunta: view };
    }

    // Only the employee's open tickets, looked up as them, in the order the model gave (R7).
    try {
      const open = await servicesFrom(context).tickets.list("open");
      const byNumber = new Map(open.map((t) => [t.number, t]));
      const tickets = [...new Set(chamados!.map((n) => n.trim().toUpperCase()))].flatMap((n) => {
        const t = byNumber.get(n);
        return t
          ? [{ number: t.number, title: t.title, status: t.status, openedAt: t.openedAt }]
          : [];
      });
      if (tickets.length === 0) return { encontrado: false as const };
      const view: QuestionView = { kind: "tickets", question: pergunta, tickets };
      return { pergunta: view };
    } catch (error) {
      return failureOf(error);
    }
  },
});
