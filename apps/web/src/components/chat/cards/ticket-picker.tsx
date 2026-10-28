import { ticketChoiceText, type QuestionView } from "@nexo/shared";
import { useRef } from "react";
import { formatDay, STATUS_DOT, STATUS_LABEL, STATUS_TEXT } from "../../../lib/format";
import { CardShell } from "./card-shell";

// Ticket picker (prototype, Screen 3; stage 7 PRD, S-07.2). A single-choice list: picking a
// ticket sends "NÚMERO · título" as the employee's message. Arrow keys move between tickets,
// Enter or Space picks.

export function TicketPicker({
  question,
  waiting,
  chosen,
  disabled,
  onPick,
}: {
  question: Extract<QuestionView, { kind: "tickets" }>;
  waiting: boolean;
  chosen: number | null;
  disabled: boolean;
  onPick: (text: string) => void;
}) {
  const rows = useRef<(HTMLDivElement | null)[]>([]);
  const active = waiting && !disabled;

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const last = question.tickets.length - 1;
    const move = (to: number) => {
      event.preventDefault();
      rows.current[to]?.focus();
    };
    if (event.key === "ArrowDown" || event.key === "ArrowRight")
      move(index === last ? 0 : index + 1);
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") move(index === 0 ? last : index - 1);
    if ((event.key === "Enter" || event.key === " ") && active) {
      event.preventDefault();
      onPick(ticketChoiceText(question.tickets[index]!));
    }
  }

  return (
    <CardShell label={question.question}>
      <div
        role="radiogroup"
        aria-label={question.question}
        aria-disabled={!active}
        className="-mx-4 -my-3.5 divide-y divide-rule sm:-mx-5"
      >
        {question.tickets.map((t, i) => {
          const selected = chosen === i;
          return (
            <div
              key={t.number}
              ref={(el) => {
                rows.current[i] = el;
              }}
              role="radio"
              aria-checked={selected}
              aria-disabled={!active}
              tabIndex={active ? (i === 0 ? 0 : -1) : -1}
              onClick={() => active && onPick(ticketChoiceText(t))}
              onKeyDown={(event) => onKeyDown(event, i)}
              className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-[14px] outline-none focus-visible:bg-primary-soft sm:flex-nowrap sm:px-5 ${
                selected ? "bg-primary-soft" : ""
              } ${active ? "cursor-pointer hover:bg-desk" : ""}`}
            >
              <span
                aria-hidden="true"
                className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
                  selected ? "border-cta" : "border-ink-3/50"
                }`}
              >
                {selected && <span className="size-2 rounded-full bg-cta" />}
              </span>
              <span className="shrink-0 text-[13px] text-ink-3">{t.number}</span>
              <span className="min-w-0 flex-1 font-medium text-ink">{t.title}</span>
              <span className="ml-7 flex shrink-0 items-center gap-3 text-[13px] sm:ml-0">
                <span className={`flex items-center gap-1.5 ${STATUS_TEXT[t.status]}`}>
                  <span
                    aria-hidden="true"
                    className={`size-1.5 rounded-full ${STATUS_DOT[t.status]}`}
                  />
                  {STATUS_LABEL[t.status]}
                </span>
                <span className="w-12 text-right text-ink-3">{formatDay(t.openedAt)}</span>
              </span>
            </div>
          );
        })}
      </div>
    </CardShell>
  );
}
