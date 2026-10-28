import type { QuestionView } from "@nexo/shared";

// A question with quick-reply options (prototype, Screens 2 and 3; stage 7 PRD, S-07.3).
// Picking an option sends its text as the employee's message; once answered, the options are
// disabled and the chosen one stays highlighted (S-07.4). While it waits, the number keys pick
// the options (S-07.9), so each option shows its number.

export function QuickQuestion({
  question,
  waiting,
  chosen,
  disabled,
  onPick,
}: {
  question: Extract<QuestionView, { kind: "options" }>;
  waiting: boolean;
  chosen: number | null;
  disabled: boolean;
  onPick: (text: string) => void;
}) {
  const active = waiting && !disabled;
  return (
    <div className="mt-3">
      <p className="text-[14.5px] font-semibold text-ink">{question.question}</p>
      <div role="group" aria-label={question.question} className="mt-2.5 flex flex-wrap gap-1.5">
        {question.options.map((option, i) => {
          const selected = chosen === i;
          return (
            <button
              key={option}
              type="button"
              disabled={!active}
              aria-pressed={selected}
              onClick={() => onPick(option)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-[7px] text-[13.5px] font-medium ${
                selected
                  ? "border-primary bg-primary-soft text-primary-text"
                  : "border-rule bg-paper text-ink"
              } ${active ? "hover:border-primary hover:bg-primary-soft hover:text-primary-text" : ""} ${
                !active && !selected ? "opacity-60" : ""
              }`}
            >
              {option}
              {waiting && (
                <kbd aria-hidden="true" className="font-sans text-[11px] text-ink-3">
                  {i + 1}
                </kbd>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
