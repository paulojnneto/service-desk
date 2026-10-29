import type { Confidence, DecisionRecord, HandoffReason, Intent } from "@nexo/shared";
import { inArray } from "drizzle-orm";
import {
  appendAnalystMessage,
  appendEmployeeMessage,
  appendMessage,
  closeByAnalyst,
  findOpenConversation,
  handOffConversation,
  takeOver,
} from "../conversations/repository";
import type { Db } from "../db/connect";
import { conversations, decisions, drafts, handoffs, messages } from "../db/schema";

// Sample conversations for the analyst console (stage 9 PRD, S-09.15): one per state of
// Screen 4, written through the same repository functions the app uses, with decision
// records. Development only. It replaces only these employees' conversations; Ana's, the
// one people try the chat with, is never touched.

export const SAMPLE_EMPLOYEES = [
  "carla.mendes",
  "bruno.tavares",
  "diego.ramos",
  "elisa.prado",
  "fabio.nunes",
  "gabriela.rocha",
] as const;

const MINUTE = 60 * 1000;

type Step =
  | { employee: string }
  | { agent: string; intent: Intent; confidence: Confidence; rationale: string; rules?: string[] }
  | { handoff: HandoffReason; summary: string; ticket?: string }
  | { takeOver: string }
  | { analyst: string; text: string }
  | { close: string };

type Sample = { employeeId: string; minutesAgo: number; steps: Step[] };

const SAMPLES: Sample[] = [
  {
    // Waiting, critical: "Transferida · REQ-10439".
    employeeId: "carla.mendes",
    minutesAgo: 12,
    steps: [
      { employee: "Preciso de acesso ao SAP ainda hoje, tenho pedidos de clientes para lançar." },
      {
        agent:
          "Seu pedido REQ-10439 está aguardando um analista. Como é para hoje, vou chamar alguém do service desk.",
        intent: "status_chamado",
        confidence: "alta",
        rationale:
          "A pessoa precisa do acesso hoje para lançar pedidos de clientes; o pedido ainda espera um analista.",
        rules: ["R6", "R7"],
      },
      {
        handoff: "caso_critico",
        summary:
          "Carla precisa de acesso ao SAP hoje para lançar pedidos de clientes; o REQ-10439 ainda não foi atendido.",
        ticket: "REQ-10439",
      },
    ],
  },
  {
    // Waiting, low confidence: "Agente pediu ajuda · confiança baixa".
    employeeId: "bruno.tavares",
    minutesAgo: 20,
    steps: [
      { employee: "O negócio do terceiro andar voltou a dar problema." },
      {
        agent: "Não entendi bem: é a impressora do 3º andar (INC-20305) ou outra coisa?",
        intent: "outro",
        confidence: "baixa",
        rationale:
          "A pessoa não disse o que deu problema; pode ser a impressora do chamado aberto.",
      },
      { employee: "Não é bem isso, é complicado de explicar." },
      {
        agent: "Vou chamar um analista para isso.",
        intent: "falar_com_analista",
        confidence: "baixa",
        rationale: "Mesmo depois da pergunta, não ficou claro o que a pessoa precisa.",
        rules: ["R6"],
      },
      {
        handoff: "baixa_confianca",
        summary:
          "Bruno relata um problema no 3º andar, que não parece ser a impressora do INC-20305. Não consegui entender o que é.",
      },
    ],
  },
  {
    // With the agent, low confidence: shows in "Para você" without a handoff (A2).
    employeeId: "diego.ramos",
    minutesAgo: 3,
    steps: [
      { employee: "A VPN de novo..." },
      {
        agent: "Você quer saber do INC-20309, sobre a VPN que cai, ou é um problema novo?",
        intent: "status_chamado",
        confidence: "baixa",
        rationale:
          "A pessoa citou a VPN sem detalhes; pode ser o chamado aberto ou um problema novo.",
        rules: ["R7"],
      },
    ],
  },
  {
    // With the agent, going well.
    employeeId: "elisa.prado",
    minutesAgo: 30,
    steps: [
      { employee: "Qual o horário do service desk?" },
      {
        agent: "O service desk atende de segunda a sexta, das 8h às 18h.",
        intent: "duvida",
        confidence: "alta",
        rationale: "A pessoa perguntou o horário de atendimento do service desk.",
      },
    ],
  },
  {
    // Held by Rafael: "Minhas".
    employeeId: "gabriela.rocha",
    minutesAgo: 45,
    steps: [
      { employee: "Quero falar com um analista sobre a licença do AutoCAD." },
      {
        agent: "Pronto, transferi a conversa para a equipe do service desk com um resumo.",
        intent: "falar_com_analista",
        confidence: "alta",
        rationale: "A pessoa pediu para falar com um analista.",
        rules: ["R6"],
      },
      {
        handoff: "pedido_do_funcionario",
        summary: "Gabriela quer falar sobre a licença do AutoCAD.",
      },
      { takeOver: "rafael.lima" },
      {
        analyst: "rafael.lima",
        text: "Oi, Gabriela! Aqui é o Rafael. Qual versão do AutoCAD você precisa?",
      },
      { employee: "A 2026, para o projeto novo." },
    ],
  },
  {
    // Closed by an analyst.
    employeeId: "fabio.nunes",
    minutesAgo: 90,
    steps: [
      { employee: "Quero falar com uma pessoa, o Teams não abre." },
      {
        agent: "Pronto, transferi a conversa para a equipe do service desk com um resumo.",
        intent: "falar_com_analista",
        confidence: "alta",
        rationale: "A pessoa pediu para falar com uma pessoa.",
        rules: ["R6"],
      },
      { handoff: "pedido_do_funcionario", summary: "Fábio não consegue abrir o Teams." },
      { takeOver: "julia.castro" },
      { analyst: "julia.castro", text: "Limpei o cache do Teams pelo acesso remoto. Pode testar?" },
      { employee: "Isso resolveu, obrigado!" },
      { close: "julia.castro" },
    ],
  },
];

export async function seedConversations(db: Db, now = new Date()) {
  await deleteSampleConversations(db);
  for (const sample of SAMPLES) await writeSample(db, sample, now);
  return { conversations: SAMPLES.length };
}

async function deleteSampleConversations(db: Db) {
  const ids = (
    await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(inArray(conversations.employeeId, [...SAMPLE_EMPLOYEES]))
  ).map((row) => row.id);
  if (ids.length === 0) return;
  await db.transaction(async (tx) => {
    await tx.delete(decisions).where(inArray(decisions.conversationId, ids));
    await tx.delete(drafts).where(inArray(drafts.conversationId, ids));
    await tx.delete(handoffs).where(inArray(handoffs.conversationId, ids));
    await tx.delete(messages).where(inArray(messages.conversationId, ids));
    await tx.delete(conversations).where(inArray(conversations.id, ids));
  });
}

// One minute between steps, ending `minutesAgo` before now.
async function writeSample(db: Db, sample: Sample, now: Date) {
  const { employeeId, steps } = sample;
  const start = now.getTime() - (sample.minutesAgo + steps.length) * MINUTE;
  for (const [index, step] of steps.entries()) {
    const at = new Date(start + (index + 1) * MINUTE);
    const conversationId = (await findOpenConversation(db, employeeId))?.id;
    if ("employee" in step) {
      await appendEmployeeMessage(
        db,
        employeeId,
        { clientId: `seed-${index}`, parts: [{ type: "text", text: step.employee }] },
        at,
      );
    } else if ("agent" in step) {
      await appendMessage(
        db,
        employeeId,
        {
          author: "agent",
          parts: [{ type: "text", text: step.agent }],
          decision: decisionOf(step),
        },
        at,
      );
    } else if ("handoff" in step) {
      await handOffConversation(
        db,
        conversationId!,
        { reason: step.handoff, summary: step.summary, ticketNumber: step.ticket ?? null },
        at,
      );
    } else if ("takeOver" in step) {
      await takeOver(db, conversationId!, step.takeOver, at);
    } else if ("analyst" in step) {
      await appendAnalystMessage(
        db,
        conversationId!,
        step.analyst,
        { clientId: `seed-${index}`, text: step.text },
        at,
      );
    } else {
      await closeByAnalyst(db, conversationId!, step.close, at);
    }
  }
}

// A record that claims only what the sample shows: a handoff ran the transfer tool.
function decisionOf(step: Extract<Step, { agent: string }>): DecisionRecord {
  const transferred = step.intent === "falar_com_analista";
  return {
    intent: step.intent,
    action: transferred
      ? "transferiu"
      : step.confidence === "baixa"
        ? "pediu_esclarecimento"
        : "respondeu",
    confidence: step.confidence,
    rationale: step.rationale,
    rules: (step.rules ?? []) as DecisionRecord["rules"],
    enforcedRules: transferred ? ["R6"] : [],
    tools: transferred ? [{ name: "transferirParaAnalista", outcome: "ok" }] : [],
    source: "agent",
    registered: true,
  };
}
