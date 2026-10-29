import type { DecisionRecord } from "@nexo/shared";
import { Check, CircleAlert, Info } from "lucide-react";
import { CONFIDENCE_STYLE } from "./confidence-style";
import { decisionView, type RuleView } from "./view";

// The decision behind one reply (stage 8 PRD, S-08.1): what the agent understood, what it
// did, how confident it was, why, and how. It takes only the record, so the analyst console
// (Stage 9) shows the same thing. Every text is rendered as plain text (S-08.9).

export function DecisionDetail({ id, record }: { id?: string; record?: DecisionRecord }) {
  const view = decisionView(record);
  return (
    <section
      id={id}
      aria-label="Detalhe da decisão"
      className="w-full max-w-[600px] rounded-xl border border-rule bg-desk px-4 py-3 text-[13.5px] leading-[1.45] text-ink"
    >
      {view.kind === "none" ? (
        <Note>{view.note}</Note>
      ) : (
        <>
          {view.note && <Note>{view.note}</Note>}
          <dl className="grid gap-x-4 gap-y-2.5 sm:grid-cols-[112px_1fr]">
            <Row label="Entendeu">{view.understood}</Row>
            <Row label="Fez">{view.did}</Row>
            {view.confidence && (
              <Row label="Confiança">
                <span className="flex flex-wrap items-baseline gap-x-1.5">
                  <span
                    className={`flex items-center gap-1.5 font-medium ${CONFIDENCE_STYLE[view.confidence.level].text}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`size-1.5 shrink-0 rounded-full ${CONFIDENCE_STYLE[view.confidence.level].dot}`}
                    />
                    {view.confidence.word}
                  </span>
                  <span className="text-ink-3">· {view.confidence.meaning}</span>
                </span>
              </Row>
            )}
            {view.rationale && <Row label="Por quê">{view.rationale}</Row>}
            {view.tools.length > 0 && (
              <Row label="Como">
                <ul className="space-y-1">
                  {view.tools.map((tool) => (
                    <li key={tool.key} className="flex items-start gap-1.5">
                      {tool.outcome === "ok" ? (
                        <Check className="mt-[3px] size-3 shrink-0 text-ink-3" aria-hidden="true" />
                      ) : (
                        <CircleAlert
                          className="mt-[3px] size-3 shrink-0 text-warning-text"
                          aria-hidden="true"
                        />
                      )}
                      <span>
                        {tool.label}{" "}
                        <span
                          className={tool.outcome === "ok" ? "text-ink-3" : "text-warning-text"}
                        >
                          · {tool.outcomeLabel}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Row>
            )}
            {view.enforced.length > 0 && (
              <Row label="Garantidas pelo sistema">
                <Rules rules={view.enforced} />
              </Row>
            )}
            {view.cited.length > 0 && (
              <Row label="Aplicadas pelo agente">
                <Rules rules={view.cited} />
              </Row>
            )}
          </dl>
        </>
      )}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-[12.5px] text-ink-3 sm:pt-px">{label}</dt>
      <dd className="-mt-2 min-w-0 break-words sm:mt-0">{children}</dd>
    </div>
  );
}

function Rules({ rules }: { rules: RuleView[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {rules.map((rule) => (
        <li
          key={rule.code}
          className="rounded-md border border-rule bg-paper px-2 py-0.5 text-[12.5px] text-ink-2"
        >
          <span className="font-semibold text-ink">{rule.code}</span> · {rule.title}
        </li>
      ))}
    </ul>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2.5 flex items-start gap-1.5 text-ink-2 last:mb-0">
      <Info className="mt-[3px] size-3 shrink-0 text-ink-3" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
