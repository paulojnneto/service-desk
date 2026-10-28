import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowUp, LoaderCircle, RotateCcw } from "lucide-react";
import { MESSAGES_PER_SESSION } from "@nexo/shared";
import { AgentBubble, AgentMessage, QuickOption, StatusLine, UserMessage } from "./messages";

// Starting points for the empty chat (stage 3 PRD, decision 2).
const SUGGESTIONS = [
  "Qual o horário do service desk?",
  "Como está meu chamado?",
  "Quero abrir um chamado",
];

export function Chat({ firstName }: { firstName: string }) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, regenerate, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const endRef = useRef<HTMLDivElement>(null);

  const busy = status === "submitted" || status === "streaming";
  const sent = messages.filter((message) => message.role === "user").length;
  // UI-only limit for now; Stage 5 enforces it on the server.
  const limitReached = sent >= MESSAGES_PER_SESSION;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, status]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy || limitReached) return;
    sendMessage({ text: trimmed });
    setInput("");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-[920px] flex-col justify-end gap-5 px-6 pt-7 pb-1 sm:px-10">
          {messages.length === 0 && <Welcome firstName={firstName} onPick={send} disabled={busy} />}
          {messages.map((message) =>
            message.role === "user" ? (
              <UserMessage key={message.id} message={message} />
            ) : (
              <AgentMessage key={message.id} message={message} />
            ),
          )}
          {status === "submitted" && (
            <StatusLine>
              <span className="flex items-center gap-[5px] text-ink-3">
                <LoaderCircle className="size-3 animate-spin" aria-hidden="true" /> pensando…
              </span>
            </StatusLine>
          )}
          {error && <ChatError error={error} onRetry={() => regenerate()} />}
          <div ref={endRef} />
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[920px] flex-col gap-1.5 px-6 pt-2.5 pb-[18px] sm:px-10">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            send(input);
          }}
          className="flex h-12 items-center gap-2 rounded-xl border border-ink/12 bg-paper pr-1.5 pl-4 shadow-[0_1px_2px_#1B24310A] focus-within:border-cta"
        >
          <label htmlFor="chat-input" className="sr-only">
            Mensagem para o Nexo Assist
          </label>
          <input
            id="chat-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={limitReached ? "Limite de mensagens atingido" : "Escreva para o Nexo…"}
            disabled={limitReached}
            autoComplete="off"
            className="h-full flex-1 bg-transparent text-[14.5px] text-ink outline-none placeholder:text-ink-3 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={busy || limitReached || !input.trim()}
            className="flex h-9 items-center gap-1.5 rounded-md bg-cta px-3 text-[13.5px] font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
          >
            <ArrowUp className="size-3.5" aria-hidden="true" /> Enviar
          </button>
        </form>
        <p className="flex justify-end text-[12.5px] text-ink-3" aria-live="polite">
          {limitReached
            ? `Você chegou ao limite de ${MESSAGES_PER_SESSION} mensagens desta sessão.`
            : `${sent}/${MESSAGES_PER_SESSION} mensagens nesta sessão`}
        </p>
      </div>
    </div>
  );
}

function Welcome({
  firstName,
  onPick,
  disabled,
}: {
  firstName: string;
  onPick: (text: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <StatusLine />
      <AgentBubble>
        <p>
          Olá, {firstName}! Descreva o que está acontecendo com suas palavras. Eu consulto seus
          chamados, busco na central de ajuda e chamo um analista quando for preciso.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((suggestion) => (
            <QuickOption key={suggestion} onClick={() => onPick(suggestion)} disabled={disabled}>
              {suggestion}
            </QuickOption>
          ))}
        </div>
      </AgentBubble>
    </div>
  );
}

function ChatError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  // The transport puts the API's response body in the error message.
  const sessionExpired = error.message.includes("unauthenticated");
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-xl bg-danger-soft px-4 py-3 text-[13.5px] text-danger-text"
    >
      {sessionExpired ? (
        <>
          <span>Sua sessão expirou.</span>
          <Link to="/login" className="font-semibold underline">
            Entrar de novo
          </Link>
        </>
      ) : (
        <>
          <span>Não consegui responder agora. Tente novamente em instantes.</span>
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-1.5 font-semibold hover:underline"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" /> Tentar de novo
          </button>
        </>
      )}
    </div>
  );
}
