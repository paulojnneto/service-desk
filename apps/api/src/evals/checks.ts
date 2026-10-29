import type { Accept, CheckResult, Expect, Observation } from "./types";

// Turns a turn's expectations into named checks (stage 10 PRD, S-10.4 and S-10.5). Each check
// says what was expected and what happened; a value the record does not have is "absent" and
// never passes.

const ABSENT = "absent";

function list<T>(accept: Accept<T>): readonly T[] {
  return Array.isArray(accept) ? (accept as readonly T[]) : [accept as T];
}

function show<T>(accept: Accept<T>): string {
  return list(accept).join(" | ");
}

// Case and accents do not matter in text checks.
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function check(check: string, passed: boolean, expected: string, actual: string): CheckResult {
  return { check, passed, expected, actual };
}

function oneOf<T>(name: string, accept: Accept<T> | undefined, actual: T | undefined) {
  if (accept === undefined) return [];
  const value = actual === undefined ? ABSENT : String(actual);
  return [check(name, actual !== undefined && list(accept).includes(actual), show(accept), value)];
}

export function runChecks(expect: Expect, observed: Observation): CheckResult[] {
  if (observed.error) return [check("turn ran", false, "a stored reply", observed.error)];
  const decision = observed.decision;
  const called = observed.tools.map((tool) => tool.name);
  const results: CheckResult[] = [
    ...oneOf("intent", expect.intent, decision?.intent),
    ...oneOf("action", expect.action, decision?.action),
    ...oneOf("confidence", expect.confidence, decision?.confidence),
    ...oneOf("state", expect.state, observed.state ?? undefined),
  ];

  for (const tool of expect.toolsCalled ?? []) {
    results.push(
      check(`called ${tool}`, called.includes(tool), "called", called.join(", ") || "none"),
    );
  }
  for (const tool of expect.toolsNotCalled ?? []) {
    results.push(
      check(
        `did not call ${tool}`,
        !called.includes(tool),
        "not called",
        called.join(", ") || "none",
      ),
    );
  }
  for (const rule of expect.enforced ?? []) {
    const enforced = decision?.enforcedRules ?? [];
    results.push(
      check(
        `enforced ${rule}`,
        enforced.includes(rule),
        rule,
        decision ? enforced.join(", ") || "none" : ABSENT,
      ),
    );
  }

  if (expect.toolOutcome) {
    const { tool, outcome } = expect.toolOutcome;
    const outcomes = (decision?.tools ?? []).filter((t) => t.name === tool).map((t) => t.outcome);
    // Not looking it up at all is fine: nothing could leak.
    const passed = outcomes.every((value) => list(outcome).includes(value));
    results.push(
      check(`${tool} outcome`, passed, show(outcome), outcomes.join(", ") || "not called"),
    );
  }

  if (expect.draft !== undefined) results.push(...draftChecks(expect.draft, observed));
  if (expect.handoff !== undefined) results.push(...handoffChecks(expect.handoff, observed));

  if (expect.ticketsWritten !== undefined) {
    results.push(
      check(
        "tickets written",
        observed.ticketsWritten.length === expect.ticketsWritten,
        String(expect.ticketsWritten),
        observed.ticketsWritten.length === 0 ? "0" : observed.ticketsWritten.join(", "),
      ),
    );
  }

  if (expect.question !== undefined) results.push(questionCheck(expect.question, observed));

  for (const group of expect.replyIncludes ?? []) {
    const options = list(group);
    const passed = options.some((text) => fold(observed.reply).includes(fold(text)));
    results.push(check("reply mentions", passed, options.join(" | "), excerpt(observed.reply)));
  }
  if (expect.replyExcludes) {
    const text = fold(`${observed.reply} ${decision?.rationale ?? ""}`);
    const found = expect.replyExcludes.filter((word) => text.includes(fold(word)));
    results.push(
      check(
        "reply and rationale leave out",
        found.length === 0,
        `none of ${expect.replyExcludes.join(", ")}`,
        found.join(", ") || "none",
      ),
    );
  }

  if (expect.anyOf) {
    const branches = expect.anyOf.map((branch) => ({
      label: branch.label,
      checks: runChecks(branch.expect, observed),
    }));
    const winner = branches.find((branch) => branch.checks.every((c) => c.passed));
    results.push(
      check(
        "one of",
        winner !== undefined,
        branches.map((b) => b.label).join(" | "),
        winner
          ? winner.label
          : branches
              .map(
                (b) =>
                  `${b.label}: ${b.checks
                    .filter((c) => !c.passed)
                    .map((c) => `${c.check} = ${c.actual}`)
                    .join("; ")}`,
              )
              .join(" / "),
      ),
    );
  }

  return results;
}

function draftChecks(expect: NonNullable<Expect["draft"]>, observed: Observation): CheckResult[] {
  const draft = observed.newDrafts.at(-1);
  if (expect === "none") {
    return [check("no draft", !draft, "none", draft ? `${draft.kind} ${draft.number}` : "none")];
  }
  if (!draft) return [check("draft", false, "a draft", "none")];
  const fields = draft.fields as Record<string, unknown>;
  return [
    ...oneOf("draft kind", expect.kind, draft.kind),
    ...oneOf("draft ticket", expect.ticket, draft.ticketNumber ?? undefined),
    ...oneOf("draft type", expect.type, fields.type as "INC" | "REQ" | undefined),
    ...oneOf("draft category", expect.category, fields.category as string | undefined),
    ...oneOf("draft priority", expect.priority, fields.priority as never),
  ];
}

function handoffChecks(
  expect: NonNullable<Expect["handoff"]>,
  observed: Observation,
): CheckResult[] {
  const handoff = observed.newHandoffs.at(-1);
  if (expect === "none") {
    return [check("no handoff", !handoff, "none", handoff ? handoff.reason : "none")];
  }
  if (!handoff) return [check("handoff", false, "a handoff", "none")];
  return [
    ...oneOf("handoff reason", expect.reason, handoff.reason),
    ...oneOf("handoff ticket", expect.ticket, handoff.ticketNumber ?? undefined),
  ];
}

function questionCheck(
  expect: NonNullable<Expect["question"]>,
  observed: Observation,
): CheckResult {
  const question = observed.question;
  const actual = !question
    ? "none"
    : question.kind === "tickets"
      ? `picker: ${question.tickets.map((t) => t.number).join(", ")}`
      : `options: ${question.options.join(", ")}`;
  if (expect === "none") return check("no question", !question, "none", actual);
  if (expect.tickets) {
    return check("ticket picker", question?.kind === "tickets", "a ticket picker", actual);
  }
  const options = question?.kind === "options" ? question.options.map(fold) : [];
  const wanted = expect.optionsInclude ?? [];
  const passed =
    question?.kind === "options" && wanted.every((w) => options.some((o) => o.includes(fold(w))));
  return check("question options", passed, `options with ${wanted.join(", ")}`, actual);
}

function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 160 ? `${flat.slice(0, 160)}…` : flat || "(empty)";
}
