import type { AgentUsage } from "@nexo/agent";
import type {
  Confidence,
  ConversationState,
  DecisionAction,
  DecisionRecord,
  DraftKind,
  DraftView,
  HandoffReason,
  HandoffView,
  Intent,
  Priority,
  QuestionView,
  RuleId,
  ToolName,
  ToolOutcome,
} from "@nexo/shared";

// The reference conversations and what each turn must decide (stage 10 tech spec).

// One value, or any of several when Annex A allows more than one right answer (decision 3).
export type Accept<T> = T | readonly T[];

export type Expect = {
  intent?: Accept<Intent>;
  action?: Accept<DecisionAction>;
  confidence?: Accept<Confidence>;
  // Each must have run in the turn.
  toolsCalled?: ToolName[];
  toolsNotCalled?: ToolName[];
  // Each must be among the rules the code enforced.
  enforced?: RuleId[];
  toolOutcome?: { tool: ToolName; outcome: Accept<ToolOutcome> };
  // The draft prepared in this turn.
  draft?:
    | "none"
    | {
        kind?: Accept<DraftKind>;
        ticket?: string;
        type?: Accept<"INC" | "REQ">;
        category?: Accept<string>;
        priority?: Accept<Priority>;
      };
  // A handoff made in this turn.
  handoff?: "none" | { reason?: Accept<HandoffReason>; ticket?: string };
  state?: Accept<ConversationState>;
  // Tickets created, updated or reopened in the ticket service during this turn.
  ticketsWritten?: number;
  question?: "none" | { optionsInclude?: string[]; tickets?: boolean };
  // Each entry: the reply contains any of its strings, ignoring case and accents.
  replyIncludes?: Accept<string>[];
  // None of these in the reply or the rationale.
  replyExcludes?: string[];
  // Either of two sets of checks (for example, an update draft or a question first).
  anyOf?: { label: string; expect: Expect }[];
};

export type AnalystStep = { as: string; takeOver?: true; reply?: string; handBack?: true };

export type Turn =
  | { say: string; expect?: Expect }
  | { pick: string; expect?: Expect }
  | { confirm: true; expect?: Expect }
  | { analyst: AnalystStep };

export type Scenario = {
  // kebab-case, matched by --scenario.
  name: string;
  title: string;
  employee: string;
  covers: RuleId[];
  // The earlier decision the expectations follow ("S-09.2", "Stage 7, Screen 2").
  reliesOn: string;
  turns: Turn[];
};

export type ToolRun = { name: string; input: Record<string, unknown>; output: unknown };

// What a turn produced, read through the app's routes and the ticket service.
export type Observation = {
  said: string;
  reply: string;
  decision: DecisionRecord | null;
  tools: ToolRun[];
  question: QuestionView | null;
  state: ConversationState | null;
  newDrafts: DraftView[];
  newHandoffs: HandoffView[];
  ticketsWritten: string[];
  error?: string;
};

export type CheckResult = { check: string; passed: boolean; expected: string; actual: string };

export type TurnResult = { index: number; observation: Observation; checks: CheckResult[] };

export type ScenarioResult = {
  scenario: Scenario;
  run: number;
  turns: TurnResult[];
  passed: boolean;
  // Something broke apart from a wrong decision (the model call, a missing option).
  error?: string;
  usage: AgentUsage & { turns: number };
  durationMs: number;
};
