import {
  ticketChoiceText,
  toolLabel,
  type MessageMetadata,
  type DraftView,
  type Priority,
  type QuestionView,
  type TicketStatus,
} from "@nexo/shared";
import { getToolName, isToolUIPart, type UIMessage } from "ai";

// What the chat shows for each tool the agent ran (stage 7 tech spec). Pure functions, so the
// choice of card, the waiting question and the action labels are tested without a DOM.

type Part = UIMessage["parts"][number];
type ToolPart = Extract<Part, { toolCallId: string }>;

// The ticket as consultarChamado returns it (packages/agent, ticketSummary).
export type TicketSnapshot = {
  numero: string;
  titulo: string;
  tipo: "INC" | "REQ";
  categoria: string;
  prioridade: Priority;
  status: TicketStatus;
  abertoEm: string;
  ultimaAtualizacao: string;
  prazo: string | null;
  vencido: boolean;
  descricao?: string;
};

type Loadable = "loading" | "ready" | "unavailable";

export type Card =
  | { kind: "ticket"; id: string; state: Loadable; number: string; ticket?: TicketSnapshot }
  | { kind: "question"; id: string; state: Loadable; tickets: boolean; question?: QuestionView }
  | { kind: "draft"; id: string; state: Loadable; draft?: DraftView };

const DRAFT_TOOLS = new Set(["prepararChamado", "prepararAtualizacao", "prepararReabertura"]);

function toolParts(message: UIMessage): ToolPart[] {
  return message.parts.filter(isToolUIPart) as ToolPart[];
}

function inputOf(part: ToolPart): Record<string, unknown> {
  return (part.input ?? {}) as Record<string, unknown>;
}

function outputOf(part: ToolPart): Record<string, unknown> | null {
  if (part.state !== "output-available") return null;
  return (part.output ?? {}) as Record<string, unknown>;
}

function stateOf(part: ToolPart): Loadable {
  if (part.state === "output-error") return "unavailable";
  if (part.state !== "output-available") return "loading";
  return outputOf(part)!.indisponivel === true ? "unavailable" : "ready";
}

// The cards of one agent reply, in the order the tools ran. A tool that answered "not found"
// or "not allowed" has no card: the agent's text explains it.
export function cardsOf(message: UIMessage): Card[] {
  const cards: Card[] = [];
  for (const part of toolParts(message)) {
    const name = getToolName(part);
    const state = stateOf(part);
    const output = outputOf(part);
    if (output?.encontrado === false || output?.permitido === false) continue;

    if (name === "consultarChamado") {
      const number = String(inputOf(part).numero ?? "").toUpperCase();
      const ticket = output?.chamado as TicketSnapshot | undefined;
      cards.push({
        kind: "ticket",
        id: part.toolCallId,
        state,
        number,
        ...(ticket ? { ticket } : {}),
      });
    } else if (name === "perguntar") {
      const question = output?.pergunta as QuestionView | undefined;
      cards.push({
        kind: "question",
        id: part.toolCallId,
        state,
        tickets: Array.isArray(inputOf(part).chamados),
        ...(question ? { question } : {}),
      });
    } else if (DRAFT_TOOLS.has(name)) {
      const draft = output?.rascunho as DraftView | undefined;
      cards.push({ kind: "draft", id: part.toolCallId, state, ...(draft ? { draft } : {}) });
    }
  }
  return cards;
}

// --- Action line ---------------------------------------------------------------------------

const LABELS: Record<string, (input: Record<string, unknown>) => string[]> = {
  consultarHorario: () => ["consultou o horário do service desk"],
  buscarNaCentral: () => ["buscou na central de ajuda"],
  listarMeusChamados: () => ["consultou seus chamados"],
  consultarChamado: (i) => [`consultou o ${numberIn(i)}`, "calculou o prazo"],
  prepararChamado: () => ["classificou a prioridade", "calculou o prazo", "montou o rascunho"],
  prepararAtualizacao: (i) => [`consultou o ${numberIn(i)}`, "montou o rascunho"],
  prepararReabertura: (i) => [`consultou o ${numberIn(i)}`, "montou o rascunho"],
  descartarRascunho: () => ["descartou o rascunho"],
  transferirParaAnalista: () => ["chamou um analista"],
};

// Shown elsewhere: the question is the card, the decision is Stage 8.
const HIDDEN = new Set(["perguntar", "registrarDecisao"]);

function numberIn(input: Record<string, unknown>): string {
  return String(input.numero ?? "chamado").toUpperCase();
}

export type ActionLabel = { key: string; label: string; done: boolean };

// The labels above a reply (S-07.10). A tool that did not finish well keeps only its first
// label, so the line never claims a priority or a draft that was not made. A reply the server
// wrote after Confirm or Cancel has no tool parts: its record says what it did (stage 8 PRD,
// S-08.7).
export function actionLabels(message: UIMessage): ActionLabel[] {
  const parts = toolParts(message);
  const decision = (message.metadata as MessageMetadata | undefined)?.decision;
  if (parts.length === 0 && decision?.source === "server") {
    return decision.tools.map((tool, i) => {
      const label = toolLabel(tool.name, tool.subject);
      return {
        key: `${message.id}-server-${i}`,
        label: label.charAt(0).toLowerCase() + label.slice(1),
        done: true,
      };
    });
  }
  return parts.flatMap((part) => {
    const name = getToolName(part);
    if (HIDDEN.has(name)) return [];
    const labels = LABELS[name]?.(inputOf(part)) ?? [name];
    const output = outputOf(part);
    const finishedWell =
      output !== null &&
      output.indisponivel !== true &&
      output.encontrado !== false &&
      output.permitido !== false;
    const shown = finishedWell ? labels : labels.slice(0, 1);
    return shown.map((label, i) => ({
      key: `${part.toolCallId}-${i}`,
      label,
      done: part.state === "output-available" || part.state === "output-error",
    }));
  });
}

// --- Questions -----------------------------------------------------------------------------

export function questionOf(message: UIMessage): QuestionView | null {
  for (const card of cardsOf(message).toReversed()) {
    if (card.kind === "question" && card.question) return card.question;
  }
  return null;
}

// The question still waiting for an answer: only one in the last message, from the agent
// (S-07.4). Anything the employee sends after it answers it.
export function waitingQuestion(messages: UIMessage[]): QuestionView | null {
  const last = messages.at(-1);
  if (!last || last.role !== "assistant") return null;
  return questionOf(last);
}

// The text each choice sends as the employee's message.
export function choiceTexts(question: QuestionView): string[] {
  return question.kind === "options" ? question.options : question.tickets.map(ticketChoiceText);
}

// The choice the employee made, read from the message that followed the question.
export function chosenIndex(messages: UIMessage[], messageId: string): number | null {
  const index = messages.findIndex((m) => m.id === messageId);
  const question = index >= 0 ? questionOf(messages[index]!) : null;
  const answer = messages.slice(index + 1).find((m) => m.role === "user");
  if (!question || !answer) return null;
  const text = answer.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .trim();
  const found = choiceTexts(question).indexOf(text);
  return found >= 0 ? found : null;
}

// Whether a question in this message can still be answered.
export function isWaiting(messages: UIMessage[], messageId: string): boolean {
  return messages.at(-1)?.id === messageId && waitingQuestion(messages) !== null;
}

// --- Drafts --------------------------------------------------------------------------------

// The draft each reply prepared, so the chat can start its map of current states.
export function draftsIn(messages: UIMessage[]): DraftView[] {
  return messages.flatMap((m) =>
    cardsOf(m).flatMap((c) => (c.kind === "draft" && c.draft ? [c.draft] : [])),
  );
}
