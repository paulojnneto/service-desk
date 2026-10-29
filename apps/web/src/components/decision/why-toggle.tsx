import type { DecisionRecord } from "@nexo/shared";
import { ChevronDown } from "lucide-react";
import { CONFIDENCE_STYLE } from "./confidence-style";
import { confidenceSummary } from "./view";

// "Por quê?" at the end of the action line (stage 8 PRD, decision 1). Closed, it already
// shows a confidence that is média or baixa (S-08.3).
export function WhyToggle({
  open,
  controls,
  record,
  onToggle,
}: {
  open: boolean;
  controls: string;
  record?: DecisionRecord;
  onToggle: () => void;
}) {
  const summary = confidenceSummary(record);
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className="flex items-center gap-1.5 rounded text-primary-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cta"
    >
      Por quê?
      {summary && (
        <span className={`flex items-center gap-1 ${CONFIDENCE_STYLE[summary.level].text}`}>
          <span
            aria-hidden="true"
            className={`size-1.5 rounded-full ${CONFIDENCE_STYLE[summary.level].dot}`}
          />
          {summary.text}
        </span>
      )}
      <ChevronDown
        className={`size-3 transition-transform ${open ? "rotate-180" : ""}`}
        aria-hidden="true"
      />
    </button>
  );
}
