import { MAX_MESSAGE_LENGTH, type AnalystConversationView } from "@nexo/shared";
import { ArrowUp, Bot, CircleCheck, Hand, Headset, LoaderCircle } from "lucide-react";
import { useState } from "react";
import type { ConsoleAction } from "../../lib/api";
import { allowedActions } from "./actions";
import { waitingFor } from "./status";

// The foot of the opened conversation (Screen 5; stage 9 PRD, S-09.7 to S-09.9): take over,
// reply, hand back and close, as the conversation's state and holder allow.

export function ConversationActions({
  conversation,
  analystId,
  now,
  busy,
  error,
  onAction,
  onReply,
}: {
  conversation: AnalystConversationView;
  analystId: string;
  now: Date;
  busy: ConsoleAction | "reply" | null;
  error: string | null;
  onAction: (action: ConsoleAction) => void;
  // Resolves to true when the reply was saved.
  onReply: (text: string) => Promise<boolean>;
}) {
  const allowed = allowedActions(conversation.state, conversation.holder, analystId);
  const firstName = conversation.employee.name.split(" ")[0];
  const handoff = conversation.handoffs.at(-1);

  let body: React.ReactNode;
  if (conversation.state === "closed") {
    body = (
      <Notice icon={<CircleCheck className="size-4" aria-hidden="true" />}>
        Atendimento encerrado.
      </Notice>
    );
  } else if (allowed.heldBy) {
    body = (
      <Notice icon={<Headset className="size-4" aria-hidden="true" />}>
        {allowed.heldBy.name} está atendendo esta conversa.
      </Notice>
    );
  } else if (allowed.reply) {
    body = (
      <>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ActionButton busy={busy === "hand-back"} onClick={() => onAction("hand-back")}>
            <Bot className="size-4" aria-hidden="true" /> Devolver ao agente
          </ActionButton>
          <ActionButton busy={busy === "close"} onClick={() => onAction("close")} tone="danger">
            <CircleCheck className="size-4" aria-hidden="true" /> Encerrar atendimento
          </ActionButton>
        </div>
        <Composer busy={busy === "reply"} onReply={onReply} />
      </>
    );
  } else {
    const waiting = conversation.state === "waiting_analyst";
    body = (
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning-text">
          <Hand className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-[200px] flex-1">
          <span className="block text-[14px] font-semibold text-ink">
            {waiting ? `${firstName} espera um atendente` : `${firstName} está com o Nexo Assist`}
          </span>
          <span className="block text-[12.5px] text-ink-3">
            {waiting && handoff
              ? `Agente pausado · aguardando ${waitingFor(handoff.at, now)}`
              : "Ao assumir, o agente para de responder."}
          </span>
        </span>
        {allowed.close && (
          <ActionButton busy={busy === "close"} onClick={() => onAction("close")} tone="quiet">
            Encerrar
          </ActionButton>
        )}
        {allowed.handBack && (
          <ActionButton busy={busy === "hand-back"} onClick={() => onAction("hand-back")}>
            <Bot className="size-4" aria-hidden="true" /> Devolver ao agente
          </ActionButton>
        )}
        <ActionButton
          busy={busy === "take-over"}
          onClick={() => onAction("take-over")}
          tone="primary"
        >
          <Headset className="size-4" aria-hidden="true" /> Assumir atendimento
        </ActionButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 border-t border-rule bg-paper px-4 py-3.5 sm:px-6">
      {body}
      {error && (
        <p role="alert" className="text-[13px] text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}

function Composer({
  busy,
  onReply,
}: {
  busy: boolean;
  onReply: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const ready = text.trim().length > 0 && !busy;

  async function send() {
    if (!ready) return;
    const value = text.trim();
    setText("");
    // The text comes back if the reply could not be saved.
    if (!(await onReply(value))) setText(value);
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
      className="flex items-end gap-2"
    >
      <label htmlFor="analyst-reply" className="sr-only">
        Responder
      </label>
      <textarea
        id="analyst-reply"
        rows={2}
        value={text}
        maxLength={MAX_MESSAGE_LENGTH}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          // Enter sends; Shift+Enter breaks the line.
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void send();
          }
        }}
        placeholder="Escreva sua resposta"
        className="min-h-12 flex-1 resize-none rounded-xl bg-desk px-4 py-3 text-[14.5px] text-ink outline-none placeholder:text-ink-3 focus:ring-2 focus:ring-cta"
      />
      <button
        type="submit"
        disabled={!ready}
        aria-label="Enviar resposta"
        className="flex size-12 shrink-0 items-center justify-center rounded-full bg-cta text-white hover:bg-primary-hover disabled:opacity-50"
      >
        {busy ? (
          <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
        ) : (
          <ArrowUp className="size-5" aria-hidden="true" />
        )}
      </button>
    </form>
  );
}

function ActionButton({
  children,
  busy,
  onClick,
  tone = "default",
}: {
  children: React.ReactNode;
  busy: boolean;
  onClick: () => void;
  tone?: "default" | "primary" | "danger" | "quiet";
}) {
  const style = {
    default: "border border-rule bg-paper text-ink-2 hover:bg-desk",
    primary: "bg-cta text-white hover:bg-primary-hover",
    danger: "bg-danger-soft text-danger-text hover:bg-danger/20",
    quiet: "text-ink-3 hover:bg-desk",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`flex h-10 items-center gap-2 rounded-lg px-3.5 text-[13.5px] font-semibold disabled:opacity-60 ${style}`}
    >
      {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

function Notice({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p role="status" className="flex items-center gap-2 text-[13.5px] text-ink-2">
      <span className="text-ink-3">{icon}</span>
      {children}
    </p>
  );
}
