"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, getToolName, type UIMessage } from "ai";
import { ArrowUp, Check, LoaderCircle } from "lucide-react";

// Label of each tool in the action line above the agent's reply.
const ACTION_LABELS: Record<string, string> = {
  consultarHorario: "consultou o horário do service desk",
};

export default function Home() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const busy = status === "submitted" || status === "streaming";

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    sendMessage({ text });
    setInput("");
  }

  return (
    <main className="mx-auto flex h-dvh w-full max-w-3xl flex-col px-6 py-8">
      <h1 className="text-lg font-bold text-ink">Nexo Assist · hello world</h1>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto py-8">
        {messages.map((message) =>
          message.role === "user" ? (
            <UserMessage key={message.id} message={message} />
          ) : (
            <AgentMessage key={message.id} message={message} />
          ),
        )}
        {status === "submitted" && (
          <p className="flex items-center gap-2 text-sm text-ink-3">
            <LoaderCircle className="size-4 animate-spin" /> Nexo Assist está pensando…
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger-text">
            Não consegui responder agora. Tente novamente em instantes.
          </p>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 rounded-xl border border-rule bg-paper p-2"
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Escreva para o Nexo…"
          className="flex-1 px-3 py-2 text-[14.5px] outline-none"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="flex items-center gap-1.5 rounded-md bg-cta px-3 py-2 text-[13.5px] font-semibold text-white disabled:opacity-50"
        >
          <ArrowUp className="size-3.5" /> Enviar
        </button>
      </form>
    </main>
  );
}

function UserMessage({ message }: { message: UIMessage }) {
  const text = message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
  return (
    <div className="flex justify-end">
      <p className="max-w-[520px] rounded-xl rounded-br-sm bg-ink px-4 py-3 text-[14.5px] text-white">
        {text}
      </p>
    </div>
  );
}

function AgentMessage({ message }: { message: UIMessage }) {
  const tools = message.parts.filter(isToolUIPart);
  const text = message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
  if (!text && tools.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
        <span className="font-semibold text-ink">Nexo Assist</span>
        {tools.map((part) => {
          const name = getToolName(part);
          const done = part.state === "output-available";
          return (
            <span key={part.toolCallId} className="flex items-center gap-1 text-ink-3">
              {done ? (
                <Check className="size-3" />
              ) : (
                <LoaderCircle className="size-3 animate-spin" />
              )}
              {ACTION_LABELS[name] ?? name}
            </span>
          );
        })}
      </div>
      {text && (
        <p className="max-w-[600px] whitespace-pre-wrap rounded-xl rounded-tl-sm border border-rule bg-paper px-4 py-3 text-[14.5px] text-ink">
          {text}
        </p>
      )}
    </div>
  );
}
