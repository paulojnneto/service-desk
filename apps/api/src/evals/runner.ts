import { onAgentUsage, type AgentUsage } from "@nexo/agent";
import {
  ticketChoiceText,
  type ConversationState,
  type ConversationView,
  type DecisionRecord,
  type QuestionView,
  type StoredMessage,
} from "@nexo/shared";
import { listHandoffs } from "../conversations/repository";
import { toHandoffView } from "../conversations/to-ui";
import type { Db } from "../db/connect";
import { createTestApp, postJson, signIn, testTickets } from "../test-app";
import { runChecks } from "./checks";
import type {
  AnalystStep,
  Observation,
  Scenario,
  ScenarioResult,
  ToolRun,
  TurnResult,
} from "./types";

// Plays one scenario through the real application in process (stage 10 PRD, decision 1): the
// chat route, the agent with the model from NEXO_AGENT_MODEL, the tools, a fresh in-memory
// database and the ticket service reseeded with the Annex B data. Nothing here touches the
// development data.

type App = Awaited<ReturnType<typeof createTestApp>>["app"];

type Snapshot = {
  conversation: ConversationView | null;
  handoffs: number;
  tickets: Map<string, string>;
};

export async function runScenario(scenario: Scenario, run = 1): Promise<ScenarioResult> {
  const started = performance.now();
  const usage: AgentUsage & { turns: number } = {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    steps: 0,
    turns: 0,
  };
  const stop = onAgentUsage((turn) => {
    usage.inputTokens += turn.inputTokens;
    usage.cachedInputTokens += turn.cachedInputTokens;
    usage.outputTokens += turn.outputTokens;
    usage.steps += turn.steps;
    usage.turns += 1;
  });

  const turns: TurnResult[] = [];
  let error: string | undefined;
  try {
    await (await testTickets()).reseed();
    const { app, db, tickets } = await createTestApp();
    const asEmployee = tickets.as(scenario.employee);
    const email = `${scenario.employee}@nexo.com.br`;
    const { cookie } = await signIn(app, email);
    const read = (): Promise<Snapshot> => snapshot(app, db, cookie, asEmployee);

    for (const [index, turn] of scenario.turns.entries()) {
      if ("analyst" in turn) {
        const failure = await actAsAnalyst(app, turn.analyst, (await read()).conversation);
        if (failure) {
          error = failure;
          break;
        }
        continue;
      }
      const before = await read();
      const said = "say" in turn ? turn.say : "pick" in turn ? turn.pick : "Confirmar";
      const failure = await play(app, cookie, turn, before.conversation);
      if (!failure) await storedReply(app, cookie, before.conversation);
      const after = await read();
      const observed = await observe(said, before, after, db, failure);
      turns.push({ index, observation: observed, checks: runChecks(turn.expect ?? {}, observed) });
      // A missing option or a failed call leaves nothing sensible for the next turns.
      if (failure) {
        error = failure;
        break;
      }
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  } finally {
    stop();
  }

  const passed = !error && turns.every((turn) => turn.checks.every((c) => c.passed));
  return {
    scenario,
    run,
    turns,
    passed,
    ...(error ? { error } : {}),
    usage,
    durationMs: Math.round(performance.now() - started),
  };
}

// Sends the employee's turn; answers why it could not, if it could not.
async function play(
  app: App,
  cookie: string,
  turn: Exclude<Scenario["turns"][number], { analyst: AnalystStep }>,
  conversation: ConversationView | null,
): Promise<string | undefined> {
  if ("confirm" in turn) {
    const draftId = conversation?.pendingDraftId;
    if (!draftId) return "there was no draft waiting for Confirmar";
    const res = await postJson(app, `/api/drafts/${draftId}/confirm`, {}, cookie);
    return res.ok ? undefined : `Confirmar answered ${res.status}: ${await res.text()}`;
  }
  let text: string;
  if ("pick" in turn) {
    const option = pickOption(lastQuestion(conversation), turn.pick);
    if (!option) return `the last reply offered no option "${turn.pick}"`;
    text = option;
  } else {
    text = turn.say;
  }
  const res = await postJson(
    app,
    "/api/chat",
    { message: { id: crypto.randomUUID(), parts: [{ type: "text", text }] } },
    cookie,
  );
  const body = await res.text();
  if (!res.ok) return `the chat answered ${res.status}: ${body}`;
  if (body.includes('"type":"error"')) return `the reply failed: ${errorIn(body)}`;
  return undefined;
}

// The reply is saved as the stream closes (Stage 5); waits a moment for it.
async function storedReply(app: App, cookie: string, before: ConversationView | null) {
  const known = before?.messages.length ?? 0;
  for (let i = 0; i < 100; i++) {
    const res = await app.request("/api/conversations/current", { headers: { cookie } });
    const { conversation } = (await res.json()) as { conversation: ConversationView | null };
    const added = (conversation?.messages ?? []).slice(conversation?.id === before?.id ? known : 0);
    if (added.some((m) => m.metadata.author === "agent")) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function actAsAnalyst(
  app: App,
  step: AnalystStep,
  conversation: ConversationView | null,
): Promise<string | undefined> {
  if (!conversation) return "there was no conversation for the analyst";
  const { cookie } = await signIn(app, `${step.as}@nexo.com.br`);
  const base = `/api/analyst/conversations/${conversation.id}`;
  const calls: [string, unknown][] = [];
  if (step.takeOver) calls.push([`${base}/take-over`, {}]);
  if (step.reply)
    calls.push([`${base}/messages`, { clientId: crypto.randomUUID(), text: step.reply }]);
  if (step.handBack) calls.push([`${base}/hand-back`, {}]);
  for (const [path, body] of calls) {
    const res = await postJson(app, path, body, cookie);
    if (!res.ok) return `the analyst's ${path.split("/").at(-1)} answered ${res.status}`;
  }
  return undefined;
}

async function snapshot(
  app: App,
  db: Db,
  cookie: string,
  asEmployee: {
    list: (scope: "all") => Promise<{ number: string; status: string; lastUpdateAt: string }[]>;
  },
): Promise<Snapshot> {
  const res = await app.request("/api/conversations/current", { headers: { cookie } });
  const { conversation } = (await res.json()) as { conversation: ConversationView | null };
  const handoffs = conversation ? (await listHandoffs(db, conversation.id)).length : 0;
  const tickets = new Map(
    (await asEmployee.list("all")).map((t) => [t.number, `${t.status}|${t.lastUpdateAt}`]),
  );
  return { conversation, handoffs, tickets };
}

async function observe(
  said: string,
  before: Snapshot,
  after: Snapshot,
  db: Db,
  error: string | undefined,
): Promise<Observation> {
  const known = new Set(before.conversation?.messages.map((m) => m.id) ?? []);
  const reply = (after.conversation?.messages ?? [])
    .filter((m) => !known.has(m.id) && m.metadata.author === "agent")
    .at(-1);
  const sameConversation = before.conversation?.id === after.conversation?.id;
  const handoffs = after.conversation
    ? (await listHandoffs(db, after.conversation.id)).slice(sameConversation ? before.handoffs : 0)
    : [];
  const draftsBefore = new Set(before.conversation?.drafts.map((d) => d.id) ?? []);
  const written = [...after.tickets].filter(
    ([number, state]) => before.tickets.get(number) !== state,
  );

  return {
    said,
    reply: reply ? textOf(reply) : "",
    decision: (reply?.metadata.decision as DecisionRecord | undefined) ?? null,
    tools: reply ? toolsOf(reply) : [],
    question: reply ? questionOf(reply) : null,
    state: (after.conversation?.state as ConversationState | undefined) ?? null,
    newDrafts: (after.conversation?.drafts ?? []).filter((d) => !draftsBefore.has(d.id)),
    newHandoffs: handoffs.map(toHandoffView),
    ticketsWritten: written.map(([number]) => number),
    ...(error ? { error } : !reply ? { error: "no stored reply" } : {}),
  };
}

type Part = { type: string; text?: string; input?: unknown; output?: unknown; state?: string };

function textOf(message: StoredMessage): string {
  return (message.parts as Part[])
    .map((part) => (part.type === "text" ? (part.text ?? "") : ""))
    .join("")
    .trim();
}

function toolsOf(message: StoredMessage): ToolRun[] {
  return (message.parts as Part[])
    .filter((part) => part.type.startsWith("tool-"))
    .map((part) => ({
      name: part.type.slice("tool-".length),
      input: (part.input ?? {}) as Record<string, unknown>,
      output: part.output,
    }));
}

function questionOf(message: StoredMessage): QuestionView | null {
  const part = (message.parts as Part[]).findLast(
    (p) => p.type === "tool-perguntar" && p.state === "output-available",
  );
  return (
    ((part?.output as { pergunta?: QuestionView } | undefined)?.pergunta as QuestionView) ?? null
  );
}

function lastQuestion(conversation: ConversationView | null): QuestionView | null {
  const last = conversation?.messages.findLast((m) => m.metadata.author === "agent");
  return last ? questionOf(last) : null;
}

// The option the UI would send: its text, or "NÚMERO · título" for a ticket.
function pickOption(question: QuestionView | null, wanted: string): string | null {
  if (!question) return null;
  const fold = (value: string) => value.toLowerCase();
  if (question.kind === "options") {
    return question.options.find((option) => fold(option).includes(fold(wanted))) ?? null;
  }
  const ticket = question.tickets.find((t) => fold(ticketChoiceText(t)).includes(fold(wanted)));
  return ticket ? ticketChoiceText(ticket) : null;
}

function errorIn(body: string): string {
  const match = /"type":"error","errorText":"([^"]*)"/.exec(body);
  return match?.[1] ?? "unknown error";
}
