import type {
  AnalystConversationView,
  ConsoleFilter,
  ConsoleList,
  ConsoleTickets,
  SessionUser,
  StoredMessage,
} from "@nexo/shared";
import { LogOut, MessageSquare } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Form, NavLink, useLoaderData, useParams } from "react-router";
import { ConversationActions } from "../../components/console/conversation-actions";
import { ConversationHistory } from "../../components/console/conversation-history";
import { ConversationList } from "../../components/console/conversation-list";
import { TicketsPanel } from "../../components/console/tickets-panel";
import { NexoMark } from "../../components/nexo-mark";
import {
  fetchAnalystConversation,
  fetchAnalystUpdates,
  fetchConsoleList,
  fetchConsoleTickets,
  runConsoleAction,
  sendAnalystMessage,
  type ConsoleAction,
} from "../../lib/api";
import { highestSeq, mergeUpdates } from "../../lib/updates";
import { useConversationUpdates } from "../../lib/use-conversation-updates";

// The analyst console (Screens 4 and 5; stage 9 PRD, M6): the conversation list, the opened
// conversation and the employee's tickets, each refreshed every 3 seconds (decision 1).
// Desktop and tablet (decision 11): the ticket panel becomes a drawer below 1280 px, and the
// list and the conversation become two views below 1024 px.
export function ConsolePage() {
  const { user } = useLoaderData() as { user: SessionUser };
  const { conversationId = null } = useParams();
  const [filter, setFilter] = useState<ConsoleFilter>("para_voce");
  const [query, setQuery] = useState("");
  const search = useDebounced(query, 250);
  // Each answer is kept with the filter and search it answers, so a change shows the
  // placeholder instead of the previous filter's rows.
  const listKey = `${filter}|${search}`;
  const [loaded, setLoaded] = useState<{ key: string; list: ConsoleList } | null>(null);
  const list = loaded?.key === listKey ? loaded.list : null;
  const [listFailures, setListFailures] = useState(0);
  const [ticketsOpen, setTicketsOpen] = useState(false);
  const now = useNow(30_000);

  const loadList = useCallback(
    () =>
      fetchConsoleList(filter, search).then(
        (answer) => {
          setLoaded({ key: `${filter}|${search}`, list: answer });
          setListFailures(0);
        },
        () => setListFailures((count) => count + 1),
      ),
    [filter, search],
  );
  useEffect(() => {
    let current = true;
    fetchConsoleList(filter, search).then(
      (answer) => current && setLoaded({ key: `${filter}|${search}`, list: answer }),
      () => current && setListFailures((count) => count + 1),
    );
    return () => {
      current = false;
    };
  }, [filter, search]);
  useConversationUpdates(loadList, true);

  const { conversation, missing, updateView } = useConversation(conversationId);
  const [busy, setBusy] = useState<ConsoleAction | "reply" | null>(null);
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null);

  // Take over, hand back or close (S-09.7, S-09.9). The answer is the conversation as it is
  // now; a refusal says why and who holds it.
  async function act(action: ConsoleAction) {
    if (!conversation) return;
    setBusy(action);
    setActionError(null);
    const result = await runConsoleAction(conversation.id, action);
    setBusy(null);
    if (result.ok) {
      updateView(() => result.conversation);
      void loadList();
      return;
    }
    setActionError({
      id: conversation.id,
      message: refusalText(result.error, result.holder?.name),
    });
    const fresh = await fetchAnalystConversation(conversation.id).catch(() => null);
    if (fresh) updateView(() => fresh);
  }

  // The reply shows at once; the stored one replaces it, or it goes away on a refusal (S-09.8).
  async function reply(text: string): Promise<boolean> {
    if (!conversation) return false;
    const clientId = crypto.randomUUID();
    const local: StoredMessage = {
      id: clientId,
      role: "assistant",
      parts: [{ type: "text", text }],
      metadata: {
        author: "analyst",
        authorName: user.name,
        ...(conversation.holder ? { authorLevel: conversation.holder.level } : {}),
        createdAt: new Date().toISOString(),
      },
    };
    const without = (view: AnalystConversationView) =>
      view.messages.filter((m) => m.id !== clientId);
    updateView((view) => ({ ...view, messages: [...view.messages, local] }));
    setBusy("reply");
    setActionError(null);
    const result = await sendAnalystMessage(conversation.id, { clientId, text });
    setBusy(null);
    if (result.ok) {
      updateView((view) => ({ ...view, messages: mergeUpdates(without(view), [result.message]) }));
      return true;
    }
    updateView((view) => ({ ...view, messages: without(view) }));
    setActionError({
      id: conversation.id,
      message: refusalText(result.error, result.holder?.name),
    });
    return false;
  }
  const { tickets, ticketsFailed, reloadTickets } = useTickets(
    conversationId,
    conversation?.handoffs.at(-1)?.ticketNumber ?? null,
  );

  const firstName = conversation?.employee.name.split(" ")[0] ?? "";
  const panel = conversation && (
    <TicketsPanel
      firstName={firstName}
      tickets={tickets}
      failed={ticketsFailed}
      holder={conversation.holder}
      handedOffAt={conversation.handoffs.at(-1)?.at ?? null}
      onRetry={reloadTickets}
    />
  );

  return (
    <div className="flex h-dvh bg-paper">
      <title>Console · Nexo Assist</title>
      <Rail user={user} waiting={list?.counts.para_voce ?? 0} />
      <div
        className={`min-w-0 flex-col border-r border-rule lg:flex lg:w-[360px] lg:shrink-0 ${conversationId ? "hidden" : "flex flex-1"}`}
      >
        <ConversationList
          list={list}
          filter={filter}
          query={query}
          selectedId={conversationId}
          analystId={user.id}
          now={now}
          failing={listFailures >= 3}
          onFilter={setFilter}
          onQuery={setQuery}
        />
      </div>
      <main className={`min-w-0 flex-1 flex-col ${conversationId ? "flex" : "hidden lg:flex"}`}>
        {!conversationId ? (
          <Empty>Escolha uma conversa para ver o histórico.</Empty>
        ) : missing ? (
          <Empty>Esta conversa não existe.</Empty>
        ) : !conversation ? (
          <Empty>Carregando a conversa…</Empty>
        ) : (
          <ConversationHistory
            conversation={conversation}
            analystId={user.id}
            onShowTickets={() => setTicketsOpen(true)}
            footer={
              <ConversationActions
                conversation={conversation}
                analystId={user.id}
                now={now}
                busy={busy}
                error={actionError?.id === conversation.id ? actionError.message : null}
                onAction={(action) => void act(action)}
                onReply={reply}
              />
            }
          />
        )}
      </main>
      {panel && (
        <div className="hidden w-[340px] shrink-0 border-l border-rule xl:block">{panel}</div>
      )}
      {panel && ticketsOpen && (
        <div
          className="fixed inset-0 z-20 flex justify-end bg-ink/20 xl:hidden"
          onClick={() => setTicketsOpen(false)}
        >
          <div
            className="h-full w-[340px] max-w-full shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <TicketsPanel
              firstName={firstName}
              tickets={tickets}
              failed={ticketsFailed}
              holder={conversation.holder}
              handedOffAt={conversation.handoffs.at(-1)?.at ?? null}
              onRetry={reloadTickets}
              onClose={() => setTicketsOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// The opened conversation, loaded once and then kept up to date from its last seq.
// view is null when the conversation does not exist.
type Loaded = { id: string; view: AnalystConversationView | null };

function useConversation(id: string | null) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!id) return;
    let current = true;
    fetchAnalystConversation(id).then(
      (view) => current && setLoaded({ id, view }),
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [id]);

  const found = loaded && loaded.id === id ? loaded : null;
  const conversation = found?.view ?? null;

  useConversationUpdates(async () => {
    if (!conversation) return;
    const updates = await fetchAnalystUpdates(conversation.id, highestSeq(conversation.messages));
    setLoaded((prev) =>
      prev?.view && prev.id === updates.conversationId
        ? {
            id: prev.id,
            view: {
              ...prev.view,
              state: updates.state,
              holder: updates.holder,
              handoffs: updates.handoffs,
              messages: mergeUpdates(prev.view.messages, updates.messages),
            },
          }
        : prev,
    );
  }, Boolean(conversation));

  // Replaces the opened conversation in place, after an action or a reply.
  const updateView = useCallback(
    (change: (view: AnalystConversationView) => AnalystConversationView) =>
      setLoaded((prev) => (prev?.view ? { id: prev.id, view: change(prev.view) } : prev)),
    [],
  );

  return { conversation, missing: found !== null && found.view === null, updateView };
}

function refusalText(error: string, holder?: string): string {
  if (error === "already_held") return `${holder ?? "Outro analista"} já assumiu esta conversa.`;
  if (error === "not_holder") return "Você não está mais com esta conversa.";
  if (error === "closed") return "Esta conversa já foi encerrada.";
  if (error === "invalid_input") return "Escreva uma resposta antes de enviar.";
  return "Não consegui fazer isso agora. Tente de novo em instantes.";
}

// The employee's tickets, read again when the conversation or its related ticket changes.
function useTickets(id: string | null, related: string | null) {
  const [attempt, setAttempt] = useState(0);
  const key = `${id}|${related}|${attempt}`;
  const [loaded, setLoaded] = useState<{ key: string; tickets: ConsoleTickets | null } | null>(
    null,
  );

  useEffect(() => {
    if (!id) return;
    let current = true;
    const answered = `${id}|${related}|${attempt}`;
    fetchConsoleTickets(id).then(
      (tickets) => current && setLoaded({ key: answered, tickets }),
      () => current && setLoaded({ key: answered, tickets: null }),
    );
    return () => {
      current = false;
    };
  }, [id, related, attempt]);

  const found = loaded?.key === key ? loaded : null;
  return {
    tickets: found?.tickets ?? null,
    ticketsFailed: found !== null && found.tickets === null,
    reloadTickets: () => setAttempt((n) => n + 1),
  };
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

// The clock for "há 12 min", refreshed now and then.
function useNow(ms: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}

function Rail({ user, waiting }: { user: SessionUser; waiting: number }) {
  return (
    <nav
      aria-label="Console"
      className="flex w-16 shrink-0 flex-col items-center gap-4 border-r border-rule bg-desk py-5"
    >
      <NexoMark className="size-6" />
      <NavLink
        to="/console"
        aria-label={`Conversas, ${waiting} para você`}
        className="relative flex size-11 items-center justify-center rounded-xl bg-paper text-ink-2 shadow-[0_1px_2px_#1B24310F]"
      >
        <MessageSquare className="size-5" aria-hidden="true" />
        {waiting > 0 && (
          <span className="absolute -top-1 -right-1 flex size-[18px] items-center justify-center rounded-full bg-cta text-[10.5px] font-bold text-white">
            {waiting}
          </span>
        )}
      </NavLink>
      <div className="flex-1" />
      <span
        title={user.name}
        className="flex size-9 items-center justify-center rounded-full bg-primary-soft text-[12.5px] font-bold text-primary-text"
      >
        {user.initials}
      </span>
      <Form method="post" action="/sign-out">
        <button
          type="submit"
          aria-label="Sair"
          className="flex size-9 items-center justify-center rounded-lg text-ink-3 hover:bg-rule"
        >
          <LogOut className="size-4" aria-hidden="true" />
        </button>
      </Form>
    </nav>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-desk px-6 text-center text-[14px] text-ink-3">
      {children}
    </div>
  );
}
