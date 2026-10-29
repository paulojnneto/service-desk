import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

// pnpm eval — plays the reference conversations and scores every decision (stage 10 tech
// spec). The simulated model unless --model is given, so it never spends money by accident.
//
//   pnpm eval                                  every scenario, simulated, console only
//   pnpm eval --scenario reabertura            names containing "reabertura"
//   pnpm eval --model openai/gpt-5.5           real model; writes docs/evals/<date>-<model>.md
//   pnpm eval --model openai/gpt-5.5 --repeat 3 --no-report

const { values } = parseArgs({
  options: {
    model: { type: "string" },
    scenario: { type: "string", multiple: true },
    repeat: { type: "string", default: "1" },
    report: { type: "boolean" },
    "no-report": { type: "boolean" },
  },
});

const model = values.model ?? "mock";
const simulated = model === "mock";
// Set before the app is imported: the agent reads its model when it loads (stage 6).
process.env.NEXO_AGENT_MODEL = model;
await import("../env");

const repeat = Number(values.repeat);
if (!Number.isInteger(repeat) || repeat < 1) {
  console.error("--repeat must be a whole number from 1.");
  process.exit(1);
}

const { SCENARIOS } = await import("../evals/scenarios");
const wanted = values.scenario ?? [];
const scenarios = wanted.length
  ? SCENARIOS.filter((s) => wanted.some((name) => s.name.includes(name)))
  : SCENARIOS;
if (scenarios.length === 0) {
  console.error(`No scenario matches ${wanted.join(", ")}. The scenarios are:`);
  for (const s of SCENARIOS) console.error(`  ${s.name}`);
  process.exit(1);
}

// A real model needs its provider's key ("openai/gpt-5.5" → OPENAI_API_KEY).
if (!simulated) {
  const provider = model.split("/")[0]!;
  const key = `${provider.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`;
  if (!process.env[key]) {
    console.error(`${key} is not set (apps/api/.env.local); the model ${model} cannot run.`);
    process.exit(1);
  }
}

const employeeTurns = scenarios.reduce(
  (n, s) => n + s.turns.filter((turn) => !("analyst" in turn)).length,
  0,
);
console.log(
  `${scenarios.length} ${scenarios.length === 1 ? "scenario" : "scenarios"} × ${repeat} ${repeat === 1 ? "run" : "runs"}, ${employeeTurns * repeat} employee turns, model ${model}${simulated ? " (simulated, no cost)" : ""}`,
);

const { runScenario } = await import("../evals/runner");
const { consoleReport, markdownReport } = await import("../evals/report");
const results = [];
for (const scenario of scenarios) {
  for (let run = 1; run <= repeat; run++) {
    const result = await runScenario(scenario, run);
    process.stdout.write(result.passed ? "." : "F");
    results.push(result);
  }
}
process.stdout.write("\n\n");

const info = { model, date: new Date().toISOString().slice(0, 10), repeat };
console.log(consoleReport(results, info));

const writeReport = values["no-report"] ? false : (values.report ?? !simulated);
if (writeReport) {
  const folder = fileURLToPath(new URL("../../../../docs/evals/", import.meta.url));
  mkdirSync(folder, { recursive: true });
  const base = `${info.date}-${model
    .split("/")
    .at(-1)!
    .replace(/[^a-z0-9.-]/gi, "-")}`;
  let file = `${folder}${base}.md`;
  for (let n = 2; existsSync(file); n++) file = `${folder}${base}-${n}.md`;
  writeFileSync(file, markdownReport(results, info));
  console.log(`\nReport: ${file}`);
}

process.exit(results.every((r) => r.passed) ? 0 : 1);
