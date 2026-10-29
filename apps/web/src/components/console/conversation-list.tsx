import type { ConsoleFilter, ConsoleList, ConversationSummary } from "@nexo/shared";
import { Search } from "lucide-react";
import { Link } from "react-router";
import { formatTime } from "../../lib/format";
import { rowStatus, TONE_DOT, TONE_TEXT, waitingFor } from "./status";

// The conversation list of Screen 4 (stage 9 PRD, S-09.3 and S-09.4): search, filters with
// their counts, and one row per conversation with its status.

const FILTERS: { id: ConsoleFilter; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "para_voce", label: "Para você" },
  { id: "com_agente", label: "Com o agente" },
  { id: "minhas", label: "Minhas" },
];

export function ConversationList({
  list,
  filter,
  query,
  selectedId,
  analystId,
  now,
  failing,
  onFilter,
  onQuery,
}: {
  list: ConsoleList | null;
  filter: ConsoleFilter;
  query: string;
  selectedId: string | null;
  analystId: string;
  now: Date;
  failing: boolean;
  onFilter: (filter: ConsoleFilter) => void;
  onQuery: (query: string) => void;
}) {
  return (
    <section aria-label="Conversas" className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-3 px-4 pt-5 pb-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-[20px] font-bold tracking-[-0.3px] text-ink">Conversas</h1>
          {failing ? (
            <span role="status" className="text-[12px] text-warning-text">
              reconectando…
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[12px] font-semibold text-success-text">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
              Disponível
            </span>
          )}
        </div>
        <label className="flex h-10 items-center gap-2 rounded-full bg-desk px-3.5 focus-within:ring-2 focus-within:ring-cta">
          <Search className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
          <span className="sr-only">Pesquisar conversa ou chamado</span>
          <input
            type="search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Pesquisar conversa ou chamado"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-3"
          />
        </label>
        <div role="tablist" aria-label="Filtros" className="flex flex-wrap gap-1.5">
          {FILTERS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={filter === id}
              onClick={() => onFilter(id)}
              className={`rounded-full px-2.5 py-1 text-[12.5px] font-medium ${
                filter === id
                  ? "bg-primary-soft text-primary-text"
                  : "bg-desk text-ink-2 hover:bg-rule"
              }`}
            >
              {label}
              {list && <span className="ml-1 text-ink-3">{list.counts[id]}</span>}
            </button>
          ))}
        </div>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {!list && <ListPlaceholder />}
        {list?.conversations.length === 0 && (
          <li className="px-3 py-8 text-center text-[13.5px] text-ink-3">
            {query ? "Nenhuma conversa encontrada." : "Nenhuma conversa aqui por enquanto."}
          </li>
        )}
        {list?.conversations.map((summary) => (
          <Row
            key={summary.id}
            summary={summary}
            selected={summary.id === selectedId}
            analystId={analystId}
            now={now}
          />
        ))}
      </ul>
    </section>
  );
}

function Row({
  summary,
  selected,
  analystId,
  now,
}: {
  summary: ConversationSummary;
  selected: boolean;
  analystId: string;
  now: Date;
}) {
  const status = rowStatus(summary, analystId);
  const last = summary.lastMessage;
  const preview = last
    ? `${last.author === "agent" ? "Nexo: " : last.author === "analyst" ? "Analista: " : ""}${last.text}`
    : "Sem mensagens";
  const waiting =
    summary.state === "waiting_analyst" && summary.handoff
      ? ` · ${waitingFor(summary.handoff.at, now)}`
      : "";
  return (
    <li>
      <Link
        to={`/console/${summary.id}`}
        aria-current={selected ? "page" : undefined}
        className={`flex gap-3 rounded-xl px-3 py-3 ${selected ? "bg-desk" : "hover:bg-desk"}`}
      >
        <Avatar employee={summary.employee} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[14.5px] font-semibold text-ink">
              {summary.employee.name}
            </span>
            <span
              className={`shrink-0 text-[12px] ${summary.state === "waiting_analyst" ? "font-semibold text-primary-text" : "text-ink-3"}`}
            >
              {formatTime(summary.updatedAt)}
            </span>
          </span>
          <span className="truncate text-[13px] text-ink-2">{preview}</span>
          <span className={`flex items-center gap-1.5 text-[12px] ${TONE_TEXT[status.tone]}`}>
            <span
              aria-hidden="true"
              className={`size-1.5 shrink-0 rounded-full ${TONE_DOT[status.tone]}`}
            />
            <span className="truncate">
              {status.text}
              {waiting}
            </span>
          </span>
        </span>
      </Link>
    </li>
  );
}

export function Avatar({
  employee,
  size = "size-10",
}: {
  employee: ConversationSummary["employee"];
  size?: string;
}) {
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: employee.avatar.bg, color: employee.avatar.fg }}
      className={`flex ${size} shrink-0 items-center justify-center rounded-full text-[13.5px] font-bold`}
    >
      {employee.initials}
    </span>
  );
}

function ListPlaceholder() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <li key={i} aria-hidden="true" className="flex animate-pulse gap-3 px-3 py-3">
          <span className="size-10 rounded-full bg-desk" />
          <span className="flex flex-1 flex-col gap-2 pt-1">
            <span className="h-3.5 w-1/2 rounded bg-desk" />
            <span className="h-3 w-4/5 rounded bg-desk" />
          </span>
        </li>
      ))}
    </>
  );
}
