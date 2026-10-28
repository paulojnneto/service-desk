import { useEffect, useRef, useState } from "react";
import { Link, useRevalidator } from "react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, getToolName, isToolUIPart, type UIMessage } from "ai";
import { ArrowUp, Headset, LoaderCircle, RotateCcw } from "lucide-react";
import {
  MESSAGES_PER_SESSION,
  type ConversationState,
  type ConversationView,
  type DraftView,
  type EditDraftInput,
  type MessageMetadata,
} from "@nexo/shared";
import {
  AgentBubble,
  AgentMessage,
  type CardContext,
  QuickOption,
  StatusLine,
  SystemNote,
  UserMessage,
} from "./messages";
import { decideDraft, editDraft, fetchCurrentConversation } from "../../lib/api";
import type { DraftActions } from "./cards/draft-card";
import { NewConversation } from "./new-conversation";
import { choiceTexts, draftsIn, waitingQuestion } from "./parts";
import { useChatShortcuts } from "./use-chat-shortcuts";

// Starting points for the empty chat (stage 3 PRD, decision 2).
const SUGGESTIONS = [
  "Qual o horário do service desk?",
  "Como está meu chamado?",
  "Quero abrir um chamado",
];

export type ChatMessage = UIMessage<MessageMetadata>;
type StatePart = { state: ConversationState };

export function Chat({
  firstName,
  conversation,
}: {
  firstName: string;
  conversation: ConversationView | null;
}) {
  const [input, setInput] = useState("");
  const [state, setState] = useState<ConversationState>(conversation?.state ?? "with_agent");
  // Every draft in its current state, from the server (stage 7 PRD, S-07.7).
  const [draftsById, setDraftsById] = useState<Record<string, DraftView>>(() =>
    byId(conversation?.drafts ?? []),
  );
  const [busyDraftId, setBusyDraftId] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<DraftActions["error"]>(null);
  const revalidator = useRevalidator();
  const { messages, setMessages, sendMessage, regenerate, status, error } = useChat<ChatMessage>({
    // The history comes from the server (stage 5 PRD, S-05.5).
    messages: (conversation?.messages ?? []) as ChatMessage[],
    transport: new DefaultChatTransport({
      api: "/api/chat",
      // Only the new message goes up; the server keeps the history (S-05.6).
      prepareSendMessagesRequest: ({ messages: all }) => {
        const last = all.findLast((message) => message.role === "user");
        return { body: { message: last && { id: last.id, parts: last.parts } } };
      },
    }),
    onData: (part) => {
      if (part.type === "data-conversation-state") setState((part.data as StatePart).state);
    },
    onFinish: ({ message }) => {
      // A new draft replaces the one waiting, and a discarded one is cancelled (S-06.6).
      const prepared = draftsIn([message]);
      const discarded = message.parts.some(
        (part) =>
          isToolUIPart(part) &&
          getToolName(part) === "descartarRascunho" &&
          part.state === "output-available" &&
          (part.output as { descartado?: boolean }).descartado,
      );
      if (prepared.length > 0 || discarded) {
        setDraftsById((all) => {
          const closed = Object.fromEntries(
            Object.values(all)
              .filter((d) => d.status === "pending")
              .map((d) => [
                d.id,
                { ...d, status: prepared.length > 0 ? "superseded" : "cancelled" },
              ]),
          ) as Record<string, DraftView>;
          return { ...all, ...closed, ...byId(prepared) };
        });
        setDraftError(null);
      }
      // After a handoff the agent stays quiet (S-06.12).
      const handedOff = message.parts.some(
        (part) =>
          isToolUIPart(part) &&
          getToolName(part) === "transferirParaAnalista" &&
          part.state === "output-available" &&
          (part.output as { transferido?: boolean }).transferido,
      );
      if (handedOff) setState("waiting_analyst");
      // The first message created the conversation: load it, so "Nova conversa" appears.
      if (!conversation) void revalidator.revalidate();
    },
  });
  const endRef = useRef<HTMLDivElement>(null);

  const busy = status === "submitted" || status === "streaming";
  // Every stored message is in the list, so this is the count stored on the server.
  const sent = messages.filter((message) => message.role === "user").length;
  const limitReached =
    sent >= MESSAGES_PER_SESSION || Boolean(error?.message.includes("message_limit_reached"));
  const withServiceDesk = state === "waiting_analyst" || state === "with_analyst";

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, status]);

  // The draft as it is now: the tool part only has it as it was prepared.
  const current = (draft: DraftView) => draftsById[draft.id] ?? draft;

  // After a refusal, reads the real state of the drafts again.
  async function refreshDrafts() {
    try {
      const fresh = await fetchCurrentConversation();
      if (fresh) setDraftsById((all) => ({ ...all, ...byId(fresh.drafts) }));
    } catch {
      // The card keeps what it had; the next action answers again.
    }
  }

  function addReply(reply: unknown) {
    if (reply) setMessages((all) => [...all, reply as ChatMessage]);
  }

  async function decide(draftId: string, action: "confirm" | "cancel") {
    setBusyDraftId(draftId);
    setDraftError(null);
    const result = await decideDraft(draftId, action);
    setBusyDraftId(null);
    addReply(result.message);
    if (result.ok) {
      setDraftsById((all) => ({ ...all, [draftId]: result.draft }));
      return;
    }
    if (result.error === "ticket_conflict" || result.error === "draft_closed") {
      await refreshDrafts();
      return;
    }
    setDraftError({
      id: draftId,
      message:
        result.error === "draft_in_progress"
          ? "Já estou registrando este rascunho."
          : "Não consegui registrar agora. O rascunho continua aqui; tente de novo em instantes.",
    });
  }

  async function save(draftId: string, edit: EditDraftInput): Promise<boolean> {
    setBusyDraftId(draftId);
    setDraftError(null);
    const result = await editDraft(draftId, edit);
    setBusyDraftId(null);
    if (result.ok) {
      setDraftsById((all) => ({ ...all, [draftId]: result.draft }));
      addReply(result.message);
      return true;
    }
    if (result.error === "draft_closed") await refreshDrafts();
    setDraftError({
      id: draftId,
      message:
        result.error === "invalid_input"
          ? "Confira os campos destacados."
          : result.error === "draft_closed"
            ? "Este rascunho não pode mais ser editado."
            : result.error === "draft_in_progress"
              ? "Já estou registrando este rascunho."
              : "Não consegui salvar agora. Tente de novo em instantes.",
    });
    return false;
  }

  const drafts: DraftActions = {
    current,
    busyId: busyDraftId,
    error: draftError,
    disabled: busy || withServiceDesk,
    confirm: (id) => void decide(id, "confirm"),
    cancel: (id) => void decide(id, "cancel"),
    save,
  };

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy || limitReached) return;
    sendMessage({ text: trimmed });
    setInput("");
  }

  const question = waitingQuestion(messages);
  const waitingDraftId =
    draftsIn(messages)
      .map(current)
      .findLast((d) => d.status === "pending")?.id ?? null;
  useChatShortcuts({
    waitingDraftId: busyDraftId ? null : waitingDraftId,
    confirm: drafts.confirm,
    choices: question ? choiceTexts(question) : null,
    composerEmpty: input.trim() === "",
    pick: send,
    enabled: !busy && !limitReached && !withServiceDesk,
  });

  // Picking a ticket or an option is the employee's message (stage 7 PRD, S-07.2, S-07.3).
  const cards: CardContext = {
    messages,
    busy: busy || limitReached || withServiceDesk,
    onPick: send,
    drafts,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-[920px] flex-col justify-end gap-5 px-6 pt-7 pb-1 sm:px-10">
          {messages.length === 0 && <Welcome firstName={firstName} onPick={send} disabled={busy} />}
          {messages.map((message) => {
            if (message.role === "user") return <UserMessage key={message.id} message={message} />;
            if (message.metadata?.author === "system") {
              return <SystemNote key={message.id} message={message} />;
            }
            return <AgentMessage key={message.id} message={message} context={cards} />;
          })}
          {status === "submitted" && !withServiceDesk && (
            <StatusLine>
              <span className="flex items-center gap-[5px] text-ink-3">
                <LoaderCircle className="size-3 animate-spin" aria-hidden="true" /> pensando…
              </span>
            </StatusLine>
          )}
          {withServiceDesk && <ServiceDeskBanner />}
          {error && !limitReached && (
            <ChatError
              error={error}
              onRetry={() => regenerate()}
              onReload={() => window.location.reload()}
            />
          )}
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
        <div className="flex justify-end text-[12.5px] text-ink-3" aria-live="polite">
          {limitReached ? (
            <span className="flex flex-wrap items-center justify-end gap-x-2">
              Você chegou ao limite de {MESSAGES_PER_SESSION} mensagens desta conversa.
              <NewConversation variant="inline" />
            </span>
          ) : (
            `${sent}/${MESSAGES_PER_SESSION} mensagens nesta sessão`
          )}
        </div>
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

// The agent is paused while the conversation is with the service desk (S-05.12).
function ServiceDeskBanner() {
  return (
    <div
      role="status"
      className="flex items-center gap-2.5 rounded-xl bg-violet-soft px-4 py-3 text-[13.5px] text-violet-text"
    >
      <Headset className="size-4 shrink-0" aria-hidden="true" />
      <span>
        Sua conversa está com a equipe de atendimento. Um analista responde por aqui; suas mensagens
        já foram enviadas.
      </span>
    </div>
  );
}

function ChatError({
  error,
  onRetry,
  onReload,
}: {
  error: Error;
  onRetry: () => void;
  onReload: () => void;
}) {
  // The transport puts the API's response body in the error message.
  const sessionExpired = error.message.includes("unauthenticated");
  const alreadyAnswered = error.message.includes("already_answered");
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
      ) : alreadyAnswered ? (
        <>
          <span>Essa mensagem já foi respondida, talvez em outra aba.</span>
          <button type="button" onClick={onReload} className="font-semibold hover:underline">
            Atualizar conversa
          </button>
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

function byId(drafts: DraftView[]): Record<string, DraftView> {
  return Object.fromEntries(drafts.map((d) => [d.id, d]));
}
