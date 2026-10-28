import {
  daysAgo,
  formatDayTime,
  PRIORITY_DOT,
  priorityLabel,
  STATUS_DOT,
  STATUS_LABEL,
  STATUS_TEXT,
} from "../../../lib/format";
import type { Card } from "../parts";
import { CardError, CardHeader, CardLoading, CardShell, Field, StatusDot } from "./card-shell";

// Ticket card (prototype, Screen 3; stage 7 PRD, S-07.1). It shows the ticket as it was when
// the agent read it: "há 5 dias" counts from that moment, which the card states.

export function TicketCard({
  card,
  readAt,
}: {
  card: Extract<Card, { kind: "ticket" }>;
  readAt: string;
}) {
  if (card.state === "loading") return <CardLoading label={`consultando o ${card.number}…`} />;
  if (card.state === "unavailable" || !card.ticket) {
    return (
      <CardError>
        Não consegui consultar o {card.number} agora: o sistema de chamados não respondeu.
      </CardError>
    );
  }

  const t = card.ticket;
  return (
    <CardShell label={`Chamado ${t.numero}`}>
      <CardHeader
        kind="Chamado"
        number={t.numero}
        status={
          <StatusDot dot={STATUS_DOT[t.status]} className={STATUS_TEXT[t.status]}>
            {STATUS_LABEL[t.status]}
          </StatusDot>
        }
      />
      <h3 className="mt-1.5 text-[17px] leading-snug font-semibold text-ink">{t.titulo}</h3>
      {t.descricao && <p className="mt-1 text-[14px] leading-normal text-ink-2">{t.descricao}</p>}
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-rule pt-3 md:grid-cols-4">
        <Field label="Categoria">{t.categoria}</Field>
        <Field label="Prioridade">
          <StatusDot dot={PRIORITY_DOT[t.prioridade]}>{priorityLabel(t.prioridade)}</StatusDot>
        </Field>
        <Field label="Aberto em">{formatDayTime(t.abertoEm)}</Field>
        <Field label="Última atualização">
          <span className={t.vencido ? "text-warning-text" : undefined}>
            {daysAgo(t.ultimaAtualizacao, readAt)}
          </span>
          {t.vencido && <span className="text-[13px] text-ink-3"> · prazo vencido</span>}
        </Field>
      </dl>
      <p className="mt-3 text-[12px] text-ink-3">Consultado em {formatDayTime(readAt)}</p>
    </CardShell>
  );
}
