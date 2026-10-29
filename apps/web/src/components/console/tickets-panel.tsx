import type { ConsoleTickets, Holder, Ticket } from "@nexo/shared";
import { isOpenStatus } from "@nexo/shared";
import { ArrowLeftRight, Headset, X } from "lucide-react";
import { formatTime, priorityLabel, STATUS_DOT, STATUS_LABEL, STATUS_TEXT } from "../../lib/format";

// The employee's tickets (Screen 4 panel; stage 9 PRD, S-09.6): the one related to the
// conversation, then the others, read on the server as that employee.

export function TicketsPanel({
  firstName,
  tickets,
  failed,
  holder,
  handedOffAt,
  onRetry,
  onClose,
}: {
  firstName: string;
  tickets: ConsoleTickets | null;
  failed: boolean;
  holder: Holder | null;
  handedOffAt: string | null;
  onRetry: () => void;
  onClose?: () => void;
}) {
  const all = tickets ? [...(tickets.related ? [tickets.related] : []), ...tickets.others] : [];
  const open = all.filter((t) => isOpenStatus(t.status)).length;
  return (
    <aside
      aria-label={`Chamados de ${firstName}`}
      className="flex h-full min-h-0 flex-col bg-paper"
    >
      <div className="flex items-start justify-between gap-2 border-b border-rule px-5 pt-5 pb-4">
        <div>
          <h2 className="text-[16px] font-semibold text-ink">Chamados de {firstName}</h2>
          {tickets && (
            <p className="text-[12.5px] text-ink-3">
              {open} {open === 1 ? "aberto" : "abertos"} · {all.length - open}{" "}
              {all.length - open === 1 ? "encerrado" : "encerrados"}
            </p>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar chamados"
            className="rounded p-1 text-ink-3 hover:bg-desk"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {failed ? (
          <p role="alert" className="text-[13px] text-danger-text">
            Não consegui carregar os chamados agora.{" "}
            <button type="button" onClick={onRetry} className="font-semibold underline">
              Tentar de novo
            </button>
          </p>
        ) : !tickets ? (
          <div aria-hidden="true" className="animate-pulse space-y-3">
            <div className="h-24 rounded-xl bg-desk" />
            <div className="h-10 rounded bg-desk" />
            <div className="h-10 rounded bg-desk" />
          </div>
        ) : (
          <>
            {tickets.related && (
              <>
                <h3 className="mb-2 text-[12.5px] font-semibold text-ink-2">Desta conversa</h3>
                <RelatedTicket ticket={tickets.related} holder={holder} handedOffAt={handedOffAt} />
              </>
            )}
            <h3 className="mt-5 mb-1 text-[12.5px] font-semibold text-ink-2">
              {tickets.related ? "Outros chamados" : "Chamados"}
            </h3>
            {tickets.others.length === 0 ? (
              <p className="py-2 text-[13px] text-ink-3">Nenhum outro chamado.</p>
            ) : (
              <ul className="divide-y divide-rule">
                {tickets.others.map((ticket) => (
                  <li key={ticket.number} className="flex gap-2.5 py-3">
                    <span
                      aria-hidden="true"
                      className={`mt-1.5 size-1.5 shrink-0 rounded-full ${STATUS_DOT[ticket.status]}`}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-medium text-ink">
                        {ticket.title}
                      </span>
                      <span className="text-[12px] text-ink-3">
                        {ticket.number} · {STATUS_LABEL[ticket.status]}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function RelatedTicket({
  ticket,
  holder,
  handedOffAt,
}: {
  ticket: Ticket;
  holder: Holder | null;
  handedOffAt: string | null;
}) {
  return (
    <div className="rounded-xl bg-desk px-4 py-3.5">
      <div className="flex items-center justify-between gap-2 text-[12.5px]">
        <span className="text-ink-2">{ticket.number}</span>
        <span className={`flex items-center gap-1.5 ${STATUS_TEXT[ticket.status]}`}>
          <span
            aria-hidden="true"
            className={`size-1.5 rounded-full ${STATUS_DOT[ticket.status]}`}
          />
          {STATUS_LABEL[ticket.status]}
        </span>
      </div>
      <p className="mt-1 text-[14.5px] font-semibold text-ink">{ticket.title}</p>
      <p className="text-[12.5px] text-ink-3">
        {ticket.category} · prioridade {priorityLabel(ticket.priority).toLowerCase()}
      </p>
      {(holder || handedOffAt) && (
        <p className="mt-3 flex items-center justify-between gap-2 border-t border-rule pt-3 text-[12.5px] text-ink-2">
          <span className="flex items-center gap-1.5">
            {holder ? (
              <Headset className="size-3.5 text-ink-3" aria-hidden="true" />
            ) : (
              <ArrowLeftRight className="size-3.5 text-ink-3" aria-hidden="true" />
            )}
            {holder ? `Assumido por ${holder.name}` : "Transferido para um analista"}
          </span>
          {handedOffAt && !holder && <span className="text-ink-3">{formatTime(handedOffAt)}</span>}
        </p>
      )}
    </div>
  );
}
