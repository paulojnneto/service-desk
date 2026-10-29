import type { MessageMetadata } from "@nexo/shared";
import type { UIMessage } from "ai";
import { Check, LoaderCircle } from "lucide-react";
import { useId, useState } from "react";
import { DecisionDetail } from "../decision/decision-detail";
import { WhyToggle } from "../decision/why-toggle";
import { QuickQuestion } from "./cards/quick-question";
import { TicketCard } from "./cards/ticket-card";
import { TicketPicker } from "./cards/ticket-picker";
import { CardError, CardLoading } from "./cards/card-shell";
import { DraftCard, type DraftActions } from "./cards/draft-card";
import { actionLabels, cardsOf, chosenIndex, isWaiting, type Card } from "./parts";

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

// What the cards of a reply need from the chat (stage 7).
export type CardContext = {
  messages: UIMessage[];
  busy: boolean;
  // A reply is streaming: its decision record arrives when it ends (stage 8 PRD, S-08.4).
  replying: boolean;
  // Sends a choice as the employee's message (S-07.2, S-07.3).
  onPick: (text: string) => void;
  drafts: DraftActions;
};

// Replies from the agent, or from an analyst once the conversation is handed off (Stage 9).
// As in the prototype, a ticket card comes before the text, a question with options sits in
// the same bubble as the text, and the picker and the draft follow it.
export function AgentMessage({ message, context }: { message: UIMessage; context?: CardContext }) {
  const [explained, setExplained] = useState(false);
  const detailId = useId();
  const labels = actionLabels(message);
  const cards = cardsOf(message);
  const text = messageText(message);
  if (!text && labels.length === 0 && cards.length === 0) return null;
  const metadata = message.metadata as MessageMetadata | undefined;
  const name = metadata?.author === "analyst" ? (metadata.authorName ?? "Analista") : "Nexo Assist";
  const readAt = metadata?.createdAt ?? new Date().toISOString();
  // Every agent reply can be explained once it has ended (stage 8 PRD, S-08.1); an analyst's
  // reply is a person's, not a decision.
  const streaming = context?.replying === true && context.messages.at(-1)?.id === message.id;
  const explainable = metadata?.author !== "analyst" && (metadata?.decision || !streaming);

  const options = cards.find(
    (c): c is Extract<Card, { kind: "question" }> =>
      c.kind === "question" && c.state === "ready" && c.question?.kind === "options",
  );
  const before = cards.filter((c) => c.kind === "ticket");
  const after = cards.filter((c) => c !== options && c.kind !== "ticket");
  const picker = after.find((c) => c.kind === "question" && c.question?.kind === "tickets");
  // The picker's question ends the text: "Você tem 3 chamados abertos. Sobre qual deles…?"
  const lead = [text, picker?.kind === "question" ? picker.question?.question : ""]
    .filter(Boolean)
    .join(" ");
  const waiting = context ? isWaiting(context.messages, message.id) : false;
  const chosen = context ? chosenIndex(context.messages, message.id) : null;
  const pick = (choice: string) => context?.onPick(choice);

  return (
    <div className="flex flex-col gap-1.5">
      <StatusLine
        name={name}
        level={metadata?.author === "analyst" ? metadata.authorLevel : undefined}
      >
        {labels.map((label) => (
          <span key={label.key} className="flex items-center gap-[5px] text-ink-3">
            {label.done ? (
              <Check className="size-3" aria-hidden="true" />
            ) : (
              <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />
            )}
            {label.label}
          </span>
        ))}
        {explainable && (
          <WhyToggle
            open={explained}
            controls={detailId}
            record={metadata?.decision}
            onToggle={() => setExplained((open) => !open)}
          />
        )}
      </StatusLine>
      {explainable && explained && <DecisionDetail id={detailId} record={metadata?.decision} />}
      {before.map((card) => (
        <CardFor
          key={card.id}
          card={card}
          readAt={readAt}
          waiting={waiting}
          chosen={chosen}
          context={context}
          onPick={pick}
        />
      ))}
      {(lead || options) && (
        <AgentBubble>
          {lead}
          {options?.question?.kind === "options" && (
            <QuickQuestion
              question={options.question}
              waiting={waiting}
              chosen={chosen}
              disabled={context?.busy ?? true}
              onPick={pick}
            />
          )}
        </AgentBubble>
      )}
      {after.map((card) => (
        <CardFor
          key={card.id}
          card={card}
          readAt={readAt}
          waiting={waiting}
          chosen={chosen}
          context={context}
          onPick={pick}
        />
      ))}
    </div>
  );
}

function CardFor({
  card,
  readAt,
  waiting,
  chosen,
  context,
  onPick,
}: {
  card: Card;
  readAt: string;
  waiting: boolean;
  chosen: number | null;
  context: CardContext | undefined;
  onPick: (text: string) => void;
}) {
  if (card.kind === "ticket") return <TicketCard card={card} readAt={readAt} />;
  if (card.kind === "question") {
    if (card.state === "loading") return <CardLoading label="consultando seus chamados…" />;
    if (card.state === "unavailable") {
      return (
        <CardError>Não consegui listar seus chamados agora. Tente de novo em instantes.</CardError>
      );
    }
    if (card.question?.kind !== "tickets") return null;
    return (
      <TicketPicker
        question={card.question}
        waiting={waiting}
        chosen={chosen}
        disabled={context?.busy ?? true}
        onPick={onPick}
      />
    );
  }
  if (card.state === "loading") return <CardLoading label="montando o rascunho…" />;
  if (card.state === "unavailable") {
    return (
      <CardError>Não consegui montar o rascunho: o sistema de chamados não respondeu.</CardError>
    );
  }
  return card.draft && context ? (
    <DraftCard snapshot={card.draft} actions={context.drafts} />
  ) : null;
}

// Notes from the system, such as "conversa transferida" (Stage 9).
export function SystemNote({ message }: { message: UIMessage }) {
  return <p className="text-center text-[12.5px] text-ink-3">{messageText(message)}</p>;
}

// Who replied ("Nexo Assist" by default) followed by the actions taken for this reply.
export function StatusLine({
  children,
  name = "Nexo Assist",
  level,
}: {
  children?: React.ReactNode;
  name?: string;
  // An analyst's level, "Suporte N2", as in Screen 5 (stage 9 PRD, decision 12).
  level?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
      <span className="font-semibold text-ink">{name}</span>
      {level && (
        <span className="rounded bg-success-soft px-1.5 py-px text-[11.5px] font-medium text-success-text">
          {level}
        </span>
      )}
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
