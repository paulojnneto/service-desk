import type { MessageMetadata } from "@nexo/shared";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { Check, LoaderCircle } from "lucide-react";
import { DraftBlock, type DraftActions } from "./draft-block";
import { draftOf } from "./draft-of";

// Label of each tool in the action line above the agent's reply. registrarDecisao is not an
// action the employee needs to see; Stage 8 shows the decision itself.
const ACTION_LABELS: Record<string, string> = {
  consultarHorario: "consultou o horário do service desk",
  buscarNaCentral: "buscou na central de ajuda",
  listarMeusChamados: "consultou seus chamados",
  consultarChamado: "consultou o chamado",
  prepararChamado: "montou o rascunho",
  prepararAtualizacao: "montou o rascunho",
  prepararReabertura: "verificou a reabertura",
  descartarRascunho: "descartou o rascunho",
  transferirParaAnalista: "chamou um analista",
};
const HIDDEN_TOOLS = new Set(["registrarDecisao"]);

function messageText(message: UIMessage): string {
  return message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
}

export function UserMessage({ message }: { message: UIMessage }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[520px] rounded-xl rounded-br-sm bg-ink px-4 py-[11px] text-[14.5px] leading-[1.45] whitespace-pre-wrap text-white">
        {messageText(message)}
      </p>
    </div>
  );
}

// Replies from the agent, or from an analyst once the conversation is handed off (Stage 9).
export function AgentMessage({ message, drafts }: { message: UIMessage; drafts?: DraftActions }) {
  const tools = message.parts
    .filter(isToolUIPart)
    .filter((part) => !HIDDEN_TOOLS.has(getToolName(part)));
  const draft = message.parts.map(draftOf).findLast(Boolean) ?? null;
  const text = messageText(message);
  if (!text && tools.length === 0) return null;
  const metadata = message.metadata as MessageMetadata | undefined;
  const name = metadata?.author === "analyst" ? (metadata.authorName ?? "Analista") : "Nexo Assist";

  return (
    <div className="flex flex-col gap-1.5">
      <StatusLine name={name}>
        {tools.map((part) => (
          <span key={part.toolCallId} className="flex items-center gap-[5px] text-ink-3">
            {part.state === "output-available" ? (
              <Check className="size-3" aria-hidden="true" />
            ) : (
              <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />
            )}
            {ACTION_LABELS[getToolName(part)] ?? getToolName(part)}
          </span>
        ))}
      </StatusLine>
      {text && <AgentBubble>{text}</AgentBubble>}
      {draft && drafts && <DraftBlock draft={draft} actions={drafts} />}
    </div>
  );
}

// Notes from the system, such as "conversa transferida" (Stage 9).
export function SystemNote({ message }: { message: UIMessage }) {
  return <p className="text-center text-[12.5px] text-ink-3">{messageText(message)}</p>;
}

// Who replied ("Nexo Assist" by default) followed by the actions taken for this reply.
export function StatusLine({
  children,
  name = "Nexo Assist",
}: {
  children?: React.ReactNode;
  name?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
      <span className="font-semibold text-ink">{name}</span>
      {children}
    </div>
  );
}

export function AgentBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[600px] rounded-xl rounded-tl-sm border border-rule bg-paper px-4 py-3 text-[14.5px] leading-[1.5] whitespace-pre-wrap text-ink shadow-[0_1px_2px_#1B24310A]">
      {children}
    </div>
  );
}

export function QuickOption({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-rule bg-paper px-3 py-[7px] text-[13.5px] font-medium text-ink hover:border-primary hover:bg-primary-soft hover:text-primary-text disabled:pointer-events-none disabled:opacity-60"
    >
      {children}
    </button>
  );
}
