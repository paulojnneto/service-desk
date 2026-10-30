import {
  HANDOFF_REASON_LABELS,
  type AnalystConversationView,
  type DraftView,
  type HandoffView,
  type MessageMetadata,
} from "@nexo/shared";
import type { UIMessage } from "ai";
import { ArrowLeft, ArrowLeftRight, PanelRight } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { formatDayTime, formatTime } from "../../lib/format";
import type { DraftActions } from "../chat/cards/draft-card";
import { AgentMessage, SystemNote, type CardContext } from "../chat/messages";
import { Avatar } from "./conversation-list";
import { stateBadge, TONE_DOT, TONE_TEXT } from "./status";

// The opened conversation (Screens 4 and 5; stage 9 PRD, S-09.5): who it is, the handoff
// summary on top, and every message in order. As in the prototype, the employee is on the
// left; Nexo Assist and analysts on the right, with the Stage 7 cards in read-only mode and
// the Stage 8 decision behind "Por quê?".

export function ConversationHistory({
  conversation,
  analystId,
  footer,
  headerActions,
  onShowTickets,
}: {
  conversation: AnalystConversationView;
  analystId: string;
  footer?: React.ReactNode;
  // In place of the state badge, while this analyst holds the conversation (Screen 5).
  headerActions?: React.ReactNode;
  onShowTickets?: () => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const messages = conversation.messages as UIMessage[];
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const badge = stateBadge(conversation.state, conversation.holder, analystId);
  const handoff = conversation.handoffs.at(-1);
  const related = conversation.ticketNumber;
  const context = readOnlyContext(messages, conversation.drafts);

  return (
    <section
      aria-label={`Conversa com ${conversation.employee.name}`}
      className="flex min-h-0 flex-1 flex-col"
    >
      <header className="flex items-center gap-3 border-b border-rule px-4 py-3.5 sm:px-6">
        <Link
          to="/console"
          aria-label="Voltar para as conversas"
          className="rounded p-1 text-ink-3 hover:bg-desk lg:hidden"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Link>
        <Avatar employee={conversation.employee} size="size-11" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-semibold text-ink">
            {conversation.employee.name}
          </p>
          <p className="truncate text-[12.5px] text-ink-3">
            {conversation.employee.department}
            {related && ` · ${related}`}
          </p>
        </div>
        {headerActions ?? (
          <span
            className={`hidden items-center gap-1.5 rounded-full bg-desk px-3 py-1.5 text-[12.5px] font-semibold sm:flex ${TONE_TEXT[badge.tone]}`}
          >
            <span aria-hidden="true" className={`size-1.5 rounded-full ${TONE_DOT[badge.tone]}`} />
            {badge.text}
          </span>
        )}
        {onShowTickets && (
          <button
            type="button"
            onClick={onShowTickets}
            aria-label="Ver chamados"
            className="rounded p-1.5 text-ink-3 hover:bg-desk xl:hidden"
          >
            <PanelRight className="size-4" aria-hidden="true" />
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-desk">
        <div className="mx-auto flex w-full max-w-[900px] flex-col gap-4 px-4 py-6 sm:px-8">
          {handoff && conversation.state !== "with_agent" && <HandoffSummary handoff={handoff} />}
          {messages.map((message) => {
            const author = (message.metadata as MessageMetadata | undefined)?.author;
            if (author === "employee")
              return <EmployeeMessage key={message.id} message={message} />;
            if (author === "system") return <SystemNote key={message.id} message={message} />;
            return <AgentMessage key={message.id} message={message} context={context} mirrored />;
          })}
          <div ref={endRef} />
        </div>
      </div>
      {footer}
    </section>
  );
}

// What the agent wrote for the analyst when it handed off (S-09.1), the first thing to read.
function HandoffSummary({ handoff }: { handoff: HandoffView }) {
  return (
    <section
      aria-label="Resumo da transferência"
      className="rounded-xl border border-rule bg-paper px-4 py-3.5 text-[13.5px] text-ink"
    >
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-3">
        <ArrowLeftRight className="size-3.5" aria-hidden="true" />
        <span className="font-semibold text-ink-2">{HANDOFF_REASON_LABELS[handoff.reason]}</span>
        <span>· {formatDayTime(handoff.at)}</span>
        {handoff.ticketNumber && <span>· {handoff.ticketNumber}</span>}
      </p>
      <p className="mt-1.5 whitespace-pre-wrap">{handoff.summary}</p>
    </section>
  );
}

function EmployeeMessage({ message }: { message: UIMessage }) {
  const metadata = message.metadata as MessageMetadata | undefined;
  const text = message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
  return (
    <div className="flex justify-start">
      <p className="max-w-[520px] rounded-xl rounded-bl-sm border border-rule bg-paper px-4 py-[11px] text-[14.5px] leading-[1.45] whitespace-pre-wrap text-ink">
        {text}
        {metadata?.createdAt && (
          <span className="ml-2 align-baseline text-[11.5px] text-ink-3">
            {formatTime(metadata.createdAt)}
          </span>
        )}
      </p>
    </div>
  );
}

// The cards of a reply, for reading: no picks, no draft buttons, drafts in their current state.
function readOnlyContext(messages: UIMessage[], drafts: DraftView[]): CardContext {
  const byId = new Map(drafts.map((draft) => [draft.id, draft]));
  const noop = () => undefined;
  const actions: DraftActions = {
    current: (draft) => byId.get(draft.id) ?? draft,
    busyId: null,
    error: null,
    disabled: true,
    confirm: noop,
    cancel: noop,
    save: async () => false,
    readOnly: true,
  };
  return { messages, busy: true, replying: false, onPick: noop, drafts: actions };
}
