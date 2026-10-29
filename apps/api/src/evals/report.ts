import { ACTION_LABELS, estimateCost, INTENT_LABELS, PRICES_READ_ON } from "@nexo/shared";
import type { Scenario, ScenarioResult, TurnResult } from "./types";

// What a run shows (stage 10 PRD, S-10.6, S-10.7 and S-10.9): one line per scenario, then
// every failure with the turn, what was expected, what happened and that turn's decision
// record, so the reason can be read without opening the database.

export type RunInfo = {
  model: string;
  date: string;
  repeat: number;
  // The --scenario filters, when the run was not the whole set.
  scenarios?: string[];
};

type ScenarioSummary = {
  scenario: Scenario;
  runs: number;
  passed: number;
  checks: { passed: number; total: number };
  turns: number;
  modelCalls: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  durationMs: number;
};

export function summarize(results: ScenarioResult[]): ScenarioSummary[] {
  const byName = new Map<string, ScenarioResult[]>();
  for (const result of results) {
    byName.set(result.scenario.name, [...(byName.get(result.scenario.name) ?? []), result]);
  }
  return [...byName.values()].map((runs) => {
    const checks = runs.flatMap((r) => r.turns.flatMap((t) => t.checks));
    const sum = (pick: (r: ScenarioResult) => number) => runs.reduce((n, r) => n + pick(r), 0);
    return {
      scenario: runs[0]!.scenario,
      runs: runs.length,
      passed: runs.filter((r) => r.passed).length,
      checks: { passed: checks.filter((c) => c.passed).length, total: checks.length },
      turns: sum((r) => r.turns.length),
      modelCalls: sum((r) => r.usage.steps),
      inputTokens: sum((r) => r.usage.inputTokens),
      cachedInputTokens: sum((r) => r.usage.cachedInputTokens),
      outputTokens: sum((r) => r.usage.outputTokens),
      durationMs: sum((r) => r.durationMs),
    };
  });
}

function totals(summaries: ScenarioSummary[]) {
  const sum = (pick: (s: ScenarioSummary) => number) => summaries.reduce((n, s) => n + pick(s), 0);
  return {
    scenarios: summaries.length,
    fullyPassed: summaries.filter((s) => s.passed === s.runs).length,
    runs: sum((s) => s.runs),
    passedRuns: sum((s) => s.passed),
    modelCalls: sum((s) => s.modelCalls),
    inputTokens: sum((s) => s.inputTokens),
    cachedInputTokens: sum((s) => s.cachedInputTokens),
    outputTokens: sum((s) => s.outputTokens),
    durationMs: sum((s) => s.durationMs),
  };
}

const number = (n: number) => n.toLocaleString("en-US");
// The estimated cost in US$ (stage 11 PRD, S-11.5), or "—" for a model without a price.
const dollars = (
  model: string,
  usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number },
) => {
  const cost = estimateCost(model, usage);
  return cost === null ? "—" : `US$ ${cost.toFixed(4)}`;
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const percent = (part: number, whole: number) =>
  whole === 0 ? "0%" : `${Math.round((part / whole) * 100)}%`;

function rate(summary: ScenarioSummary): string {
  return summary.runs === 1
    ? summary.passed === 1
      ? "passed"
      : "failed"
    : `${summary.passed}/${summary.runs} runs`;
}

// --- Console ---------------------------------------------------------------------------------

export function consoleReport(results: ScenarioResult[], info: RunInfo): string {
  const summaries = summarize(results);
  const total = totals(summaries);
  const width = Math.max(...summaries.map((s) => s.scenario.name.length));
  const lines = [
    `Evals · model ${info.model} · ${plural(total.scenarios, "scenario")} × ${info.repeat}`,
    "",
    ...summaries.map(
      (s) =>
        `${s.passed === s.runs ? "✓" : "✗"} ${s.scenario.name.padEnd(width)}  ${rate(s).padEnd(11)} ${s.checks.passed}/${s.checks.total} checks · ${plural(s.turns, "turn")} · ${seconds(s.durationMs)}`,
    ),
    "",
    `${total.fullyPassed}/${total.scenarios} scenarios passed every run (${percent(total.passedRuns, total.runs)} of runs) · ${total.modelCalls} model calls · ${number(total.inputTokens)} input tokens (${percent(total.cachedInputTokens, total.inputTokens)} cached) · ${number(total.outputTokens)} output tokens · ${dollars(info.model, total)} · ${seconds(total.durationMs)}`,
  ];
  const failures = failureBlocks(results);
  if (failures.length > 0) lines.push("", "Failures", "", ...failures.flatMap((f) => [...f, ""]));
  return lines.join("\n").trimEnd();
}

// --- Markdown --------------------------------------------------------------------------------

export function markdownReport(results: ScenarioResult[], info: RunInfo): string {
  const summaries = summarize(results);
  const total = totals(summaries);
  const rows = summaries.map(
    (s) =>
      `| \`${s.scenario.name}\` | ${s.scenario.title} | ${s.scenario.covers.join(", ") || "—"} | ${s.passed === s.runs ? "✓" : "✗"} ${rate(s)} | ${s.checks.passed}/${s.checks.total} | ${s.modelCalls} | ${number(s.inputTokens)} (${number(s.cachedInputTokens)}) | ${number(s.outputTokens)} | ${dollars(info.model, s)} | ${seconds(s.durationMs)} |`,
  );
  const failures = failureBlocks(results);
  return [
    `# Evals: ${info.model}, ${info.date}`,
    "",
    `${total.fullyPassed} of ${total.scenarios} scenarios passed every run (${percent(total.passedRuns, total.runs)} of ${total.runs} runs, ${info.repeat} per scenario). ${total.modelCalls} model calls, ${number(total.inputTokens)} input tokens (${number(total.cachedInputTokens)} cached, ${percent(total.cachedInputTokens, total.inputTokens)}), ${number(total.outputTokens)} output tokens, estimated cost ${dollars(info.model, total)} at the prices read on ${PRICES_READ_ON}, ${seconds(total.durationMs)}.`,
    "",
    "Run with `pnpm eval --model " +
      info.model +
      (info.scenarios ?? []).map((name) => ` --scenario ${name}`).join("") +
      (info.repeat > 1 ? ` --repeat ${info.repeat}` : "") +
      "`. The scenarios and what each turn must decide are in `apps/api/src/evals/scenarios.ts`.",
    "",
    "| Scenario | What | Covers | Result | Checks | Model calls | Input tokens (cached) | Output tokens | Cost | Time |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
    "## Failures",
    "",
    ...(failures.length === 0
      ? ["None.", ""]
      : failures.flatMap(([title, ...body]) => [
          `### ${title!.replace(/^✗ /, "")}`,
          "",
          "```",
          ...body,
          "```",
          "",
        ])),
    "## Analysis",
    "",
    "_To be written after reading the failures._",
    "",
  ].join("\n");
}

// --- Failures --------------------------------------------------------------------------------

function failureBlocks(results: ScenarioResult[]): string[][] {
  const blocks: string[][] = [];
  for (const result of results) {
    const runLabel =
      results.filter((r) => r.scenario.name === result.scenario.name).length > 1
        ? ` · run ${result.run}`
        : "";
    for (const turn of result.turns) {
      const failed = turn.checks.filter((c) => !c.passed);
      if (failed.length > 0) {
        blocks.push([
          `✗ ${result.scenario.name}${runLabel} · turn ${turn.index + 1}: "${turn.observation.said}"`,
          ...failed.map((c) => `  ${c.check}: expected ${c.expected} · got ${c.actual}`),
          ...recordLines(turn),
        ]);
      }
    }
    if (result.error && !result.turns.some((t) => t.observation.error === result.error)) {
      blocks.push([`✗ ${result.scenario.name}${runLabel}: ${result.error}`]);
    }
  }
  return blocks;
}

function recordLines(turn: TurnResult): string[] {
  const { decision, reply } = turn.observation;
  const quoted = reply.replace(/\s+/g, " ").trim();
  if (!decision) return ["  Decision: none stored", `  Reply: "${quoted.slice(0, 300)}"`];
  const tools = decision.tools
    .map((t) => `${t.name}${t.subject ? ` ${t.subject}` : ""} (${t.outcome})`)
    .join(", ");
  return [
    `  Decision: ${decision.intent} (${INTENT_LABELS[decision.intent] ?? ""}) · ${decision.action} (${ACTION_LABELS[decision.action] ?? ""}) · confidence ${decision.confidence}${decision.registered ? "" : " · not registered by the model"}`,
    `  Rationale: ${decision.rationale}`,
    `  Tools: ${tools || "none"}`,
    `  Rules: enforced ${decision.enforcedRules.join(", ") || "none"} · cited ${decision.rules.join(", ") || "none"}`,
    `  Reply: "${quoted.length > 300 ? `${quoted.slice(0, 300)}…` : quoted}"`,
  ];
}
