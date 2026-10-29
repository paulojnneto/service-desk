# Stage 11 — Efficiency, resilience and security: tech spec

|        |                                                              |
| ------ | ------------------------------------------------------------ |
| Issue  | [#11](https://github.com/paulojnneto/service-desk/issues/11) |
| PRD    | `prd.md` (approved on 2026-10-29)                            |
| Status | Approved on 2026-10-29                                       |

## Why Stage 10 reported no cached tokens

Mastra's `onFinish` reports cached tokens as `totalUsage.cachedInputTokens`. The `usageOf` of Stage 10 read `inputTokenDetails.cacheReadTokens`, the AI SDK's field, which Mastra's usage type does not carry. So the zero came from our reading, and the provider may well have been caching already.

The prompt order is already cache-friendly:

- the tool definitions;
- the static instructions;
- the dynamic lines (time, person, low confidence, waiting draft) at the end of the system prompt;
- then the history.

The first commit fixes the reading. A short real-model run, done only after asking, shows the real cached share. The prompt order changes only if that share stays low.

## Solution overview

```
POST /api/chat
  ├─ rate limit by address (in memory)                          S-11.10 (PRD decision 10)
  ├─ save the employee's message (Stage 5)
  ├─ limits: turns today for this employee, cost today overall  S-11.6, S-11.7
  │     └─ over a limit → fixed reply written by the server; "analista" → handoff, no model
  ├─ history for the model: older tool parts reduced            S-11.3
  ├─ agent run: abortSignal 60 s, maxRetries 1                  S-11.9
  │     └─ onFinish → requestContext "usage" sink + onAgentUsage
  └─ save reply + decision + usage (model, calls, tokens, cost, duration)  S-11.1
```

- **Usage per reply** (S-11.1). The agent's `defaultOptions` becomes a function of the request context. Its `onFinish` passes the turn's usage to a `recordUsage` callback that the chat route puts in the context, which ties the usage to this request even when several run at once. It also keeps calling `reportUsage` for the evals.

  The chat route stores the usage with the decision, in new columns of `decisions`:

  - `model`, `model_calls`;
  - `input_tokens`, `cached_input_tokens`, `output_tokens`;
  - `duration_ms`, `cost_usd`.

  The cost comes from `estimateCost(model, usage)` and a dated price table, `MODEL_PRICES` in `@nexo/shared`. An unknown model stores a null cost, and the simulated model costs zero.

- **Lean history** (S-11.3). `toAgentHistory` keeps every text and the last agent reply as it is. In older agent replies:
  - the tool parts are replaced by one compact text line built from the reply's decision record (`[Ferramentas: listarMeusChamados abertos (ok), consultarChamado INC-20311 (ok)]`);
  - a `perguntar` part becomes `[Pergunta: Quem está sendo afetado? Opções: Só eu, …]`.

  The agent still knows what it did and asked, without the old outputs (ticket lists, article bodies).

- **Limits** (S-11.6 to S-11.8). After saving the employee's message and before the agent runs, `usageToday` reads two numbers by São Paulo day:
  - the agent turns this employee had today;
  - the cost of every agent turn today.

  Over `NEXO_AGENT_TURNS_PER_DAY` (default 40) or `NEXO_DAILY_BUDGET_USD` (default 5), the server writes a fixed reply with a decision of action `limite_de_uso` and source `server`.

  If the message asks for a person (the same pattern the scripted model uses), the server hands off through `handOffConversation`, with the reason `pedido_do_funcionario` and a fixed summary, and the reply says so.

  The reply streams back like any other, so the chat needs no change.

- **Fail fast** (S-11.9). The chat route passes `abortSignal: AbortSignal.timeout(60_000)` and `modelSettings: { maxRetries: 1 }` to the agent; the AI SDK's own retry handles 429, 5xx and network errors once. A timeout ends the stream with an error chunk, which the route already treats as a failed reply: nothing is saved, and "Tentar de novo" works (Stage 5).
- **Rate limit by address** (PRD decision 10). A small in-memory fixed-window limiter (`rateLimit({ windowMs, max })`) as Hono middleware: 10 sign-ins and 30 chat messages per minute per address, answering `429 too_many_requests`. The address comes from `x-forwarded-for` only when `TRUST_PROXY=1` (Stage 12), otherwise from the socket.
- **Secrets** (S-11.12). A `secrets` job in CI runs `gitleaks/gitleaks-action@v2` with `fetch-depth: 0`, so every pull request scans the whole history. `.env.example` is updated: OpenAI as the reference, every variable of this stage, no Anthropic default.
- **Model comparison** (S-11.4, S-11.5). Done only after asking: `pnpm eval --model openai/gpt-5.5` and `pnpm eval --model openai/gpt-5.4-mini`, once each. Prices are read from OpenAI's pricing page on that day and recorded in `MODEL_PRICES` with the date. A comparison report, `docs/evals/<date>-comparison.md`, has the two runs side by side. The default goes into `.env.example` and the README.
- **Review** (S-11.10, S-11.11). `docs/security.md`, a checklist with evidence for each item:
  - R7 on every route;
  - analyst-only routes;
  - session cookie flags;
  - CSRF;
  - what logs and error bodies contain;
  - the rationale's privacy rule;
  - prompt injection;
  - secrets;
  - rate limits and budgets;
  - each ticket service outage path with its test.

  Issues found are fixed in their own commits or listed as follow-ups.

## Files and modules

| Path                                                     | What changes                                                                                                       | Why                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| `packages/agent/src/usage.ts`, test                      | `usageOf` reads Mastra's `cachedInputTokens` (falling back to the AI SDK field)                                    | Cached tokens          |
| `packages/agent/src/context.ts`                          | `NexoContext.recordUsage?: (usage) => void`                                                                        | S-11.1                 |
| `packages/agent/src/agents/nexo-assist.ts`               | `defaultOptions` as a function of the request context; `onFinish` calls `recordUsage` and `reportUsage`            | S-11.1                 |
| `packages/shared/src/costs.ts`, test                     | `MODEL_PRICES` (per million tokens: input, cached input, output; with the date read), `estimateCost(model, usage)` | S-11.1, S-11.5         |
| `packages/shared/src/decisions.ts`, `decision-labels.ts` | Action `limite_de_uso` and its label                                                                               | S-11.6                 |
| `apps/api/drizzle/0004_*.sql`, `src/db/schema.ts`        | Usage columns on `decisions`                                                                                       | S-11.1                 |
| `apps/api/src/conversations/repository.ts`               | Save usage with the decision; `usageToday(db, employeeId, now)`                                                    | S-11.1, S-11.6, S-11.7 |
| `apps/api/src/conversations/to-ui.ts`, test              | `toAgentHistory` reduces older tool parts                                                                          | S-11.3                 |
| `apps/api/src/limits.ts`, test                           | Reads the limits from the environment; `overLimit(usage, limits)`; the fixed texts                                 | S-11.6 to S-11.8       |
| `apps/api/src/rate-limit.ts`, test; `app.ts`             | Per-address limiter on sign-in and chat                                                                            | PRD decision 10        |
| `apps/api/src/routes/chat.ts`, test                      | Limits before the agent; `recordUsage`; `abortSignal` and `maxRetries`; usage saved with the decision              | S-11.1, S-11.6, S-11.9 |
| `apps/api/.env.example`                                  | OpenAI reference, `OPENAI_API_KEY`, `NEXO_AGENT_TURNS_PER_DAY`, `NEXO_DAILY_BUDGET_USD`, `TRUST_PROXY`             | S-11.8, S-11.12        |
| `.github/workflows/ci.yml`                               | `secrets` job with gitleaks over the full history                                                                  | S-11.12                |
| `apps/api/src/evals/report.ts`                           | Cached share and estimated cost per scenario and per run                                                           | S-11.2, S-11.5         |
| `docs/evals/*`                                           | The cache check run and the comparison                                                                             | S-11.2, S-11.4         |
| `docs/security.md`                                       | The review                                                                                                         | S-11.10, S-11.11       |
| `README.md`                                              | Model choice, cost per conversation, limits, link to the review                                                    | S-11.13                |

## Decisions

| Decision                        | Choice                                                                                                                    | Alternatives considered                             | Reason                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Tying usage to a request        | A `recordUsage` callback in the request context, called by `onFinish`                                                     | The global `onAgentUsage` listener                  | Concurrent requests would mix their usage; the context belongs to one request                    |
| Where usage is stored           | Columns on `decisions`, one row per agent reply                                                                           | A separate `usage` table                            | A reply and its usage are one fact; the per-day sums are one indexed query over `decisions`      |
| Counting turns and cost per day | `count(*)` and `sum(cost_usd)` of agent-source decisions since São Paulo midnight, joined to the employee's conversations | Counters in memory                                  | Survives restarts and works with more than one API instance (N6)                                 |
| Price table                     | A constant in `@nexo/shared` with the date read                                                                           | Prices from the environment; a pricing API          | Dated and reviewable in the code; changing a price is a commit                                   |
| Compact history format          | Text lines built from the decision record of the older reply                                                              | Dropping old tool parts; summarizing with the model | Keeps what the agent did and asked at a few tokens each; no extra model call                     |
| Handoff past a limit            | Detect the request in code with a simple pattern, hand off with a fixed summary                                           | Calling the model anyway for that request           | PRD decision 7: no one is cut off from a person by a budget, and no model call is spent          |
| Timeout and retry               | `AbortSignal.timeout(60_000)` and `maxRetries: 1` in the agent call                                                       | Our own retry loop                                  | The AI SDK already retries the right errors with backoff; one place to configure                 |
| Rate limiter                    | In memory, fixed window, per address                                                                                      | Redis; a library                                    | Enough to stop a script on one instance; the budget protects the money across instances          |
| Secret scan                     | gitleaks action, full history on each pull request                                                                        | A one-off local scan                                | Keeps protecting after this stage; the repository is small                                       |
| Candidate model                 | `openai/gpt-5.4-mini`, known to the Mastra router and reachable with the same key                                         | `gpt-5.4-nano`; Anthropic models                    | PRD decision 1: one smaller OpenAI model; nano risks the R3/R5/R6/R7 scenarios for little saving |

## Contracts

```ts
// packages/shared/src/costs.ts
export type ModelPrice = { input: number; cachedInput: number; output: number }; // US$ per 1M tokens
export const PRICES_READ_ON = "2026-10-29"; // set when the prices are read
export const MODEL_PRICES: Record<string, ModelPrice> = {
  "openai/gpt-5.5": { … },        // filled from the pricing page
  "openai/gpt-5.4-mini": { … },
};
export function estimateCost(
  model: string,
  usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number },
): number | null; // null for a model without a price; 0 for "mock"
```

Usage columns, migration `0004`:

```sql
alter table decisions
  add column model text,
  add column model_calls integer,
  add column input_tokens integer,
  add column cached_input_tokens integer,
  add column output_tokens integer,
  add column duration_ms integer,
  add column cost_usd numeric(10, 6);
create index decisions_created_idx on decisions (created_at);
```

They are null for server replies and for rows written before this stage.

Limits, from `apps/api/.env.local`:

```
NEXO_AGENT_TURNS_PER_DAY=40      # agent turns per employee per São Paulo day; 0 turns the limit off
NEXO_DAILY_BUDGET_USD=5          # estimated cost of all agent turns per day; 0 turns it off
TRUST_PROXY=                     # 1 behind a proxy that sets x-forwarded-for (Stage 12)
```

Fixed replies (Portuguese, as the employee reads them):

- **Employee allowance:** "Você atingiu o limite de mensagens com o assistente por hoje; ele volta amanhã. Se precisar de alguém agora, escreva 'quero falar com um analista'."
- **Daily budget:** "O assistente está pausado por hoje. Se precisar de ajuda agora, escreva 'quero falar com um analista' e a equipe do service desk responde por aqui."
- **Handoff past a limit:** "Pronto, chamei a equipe do service desk. Um analista vai responder por aqui."

## Error handling

| What fails                                  | Employee sees                                                   | Stored                                                     |
| ------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------- |
| Model call hangs past 60 s                  | "Não consegui responder agora…" with "Tentar de novo" (Stage 5) | The employee's message; no reply                           |
| One 429 or 5xx from the provider            | Nothing: the retry answers                                      | The reply, with the calls counted                          |
| A second failure                            | As a timeout                                                    | As a timeout                                               |
| Over the employee allowance or daily budget | The fixed reply                                                 | The message and a server reply with `limite_de_uso`        |
| Too many requests from one address          | `429`; the chat shows its error with "Tentar de novo"           | Nothing                                                    |
| A model without a price                     | Nothing different                                               | `cost_usd` null; the budget counts it as zero, logged once |

## Test plan

| What                                                                                                                               | Type           | Why it is worth testing |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------- |
| `usageOf` reads `cachedInputTokens`                                                                                                | Unit (agent)   | The Stage 10 zero       |
| `estimateCost`: known model, cached tokens priced apart, unknown model null, mock zero                                             | Unit (shared)  | S-11.1, S-11.5          |
| A chat turn stores model, calls, tokens, duration and cost with its decision; two turns at once keep their own usage               | Route          | S-11.1                  |
| `toAgentHistory`: last reply unchanged, older tool parts reduced to lines, question kept as a line                                 | Unit (API)     | S-11.3                  |
| Allowance 3: the fourth message gets the fixed reply without running the agent; another employee is not affected; a new day resets | Route          | S-11.6                  |
| Budget reached: fixed reply for everyone; "quero falar com um analista" hands off; the analyst can still take over and reply       | Route          | S-11.7, PRD decision 7  |
| Limits read from the environment, 0 turning them off                                                                               | Unit (API)     | S-11.8                  |
| A run that never finishes is aborted at the deadline (fake timer) and nothing is saved                                             | Route          | S-11.9                  |
| Rate limit: the 11th sign-in in a minute gets 429; a new window resets                                                             | Unit and route | PRD decision 10         |
| The simulated evals still pass                                                                                                     | CI             | S-11.3                  |

Manual validation:

1. Only after asking, the cache check: `pnpm eval --model openai/gpt-5.5 --scenario vpn` shows cached tokens.
2. Only after asking, the comparison: the full set with GPT-5.5 and with GPT-5.4-mini. Compare the input tokens per conversation with the Stage 10 report.
3. In the browser on the user's `pnpm dev`, with `NEXO_AGENT_TURNS_PER_DAY=2`: the third message gets the fixed reply, then "quero falar com um analista" hands off.
4. The secret scan in CI on the pull request.

## Commit plan

1. `docs(stage-11): tech spec`
2. `fix(agent): read the cached tokens Mastra reports`
3. `feat(shared): model prices and the cost of a turn`
4. `feat(api): usage and cost stored with every reply`
5. `perf(api): older tool outputs reduced in the agent's history`
6. `feat(api): per-employee allowance and daily budget`
7. `feat(api): a deadline and one retry for model calls`
8. `feat(api): rate limit by address on sign-in and chat`
9. `ci: secret scan over the full history`, with `.env.example` updated
10. `docs(evals): cache check and model comparison`, after asking
11. `docs: security and privacy review`, plus any fixes as their own commits
12. `docs: model choice, cost per conversation and limits`

## Risks

| Risk                                                             | Mitigation                                                                                                                                |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| The provider still caches little after the reading is fixed      | The prompt order is already static-first; if the share stays low, the spec's next step is to move the per-minute time to the last message |
| The reduced history loses something the agent needed             | The evals run before and after; the last reply keeps its tools; the waiting draft stays in the instructions (Stage 7)                     |
| GPT-5.4-mini fails a protection scenario                         | PRD decision 2 keeps GPT-5.5 as the default; the comparison report says why                                                               |
| Prices change after they are read                                | The date is in the code and the README; the budget is an estimate and says so                                                             |
| `defaultOptions` as a function changes how Mastra merges options | A route test checks the usage, `maxSteps` and the timeout together                                                                        |
| The in-memory limiter resets on restart                          | Accepted; the daily limits are in the database                                                                                            |

## Deviations during implementation

Recorded after the code, before the pull request.

| Deviation                                                                                                                                           | Why                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| The eval reports gained the cached share and the estimated cost per scenario and per run (`feat(evals)` commit before the runs)                     | Planned in the files table; done right before the paid runs so they would show it                                             |
| The comparison found GPT-5.4 mini failing three R6 scenarios, so GPT-5.5 stays the default; the gpt-6 family on the pricing page was noted, not run | PRD decisions 1 and 2                                                                                                         |
| Prices are each model's page in the OpenAI documentation; the general pricing page lists only the newest family                                     | Recorded with the date in `costs.ts` and the README                                                                           |
| Vitest's test and hook timeouts went from 5 to 15 seconds (its own commit)                                                                          | Each in-memory PostgreSQL applies every migration; with 41+ files in parallel on a busy machine, a few tests passed 5 seconds |
| The session test of the allowance signs in again on "tomorrow"                                                                                      | The session from "today" has expired by tomorrow's clock; the limits themselves were right                                    |
| The route also stops reading at the deadline, not only the agent's abort signal                                                                     | A misbehaving or fake agent that ignores the signal would hold the turn open                                                  |
| `createTestApp` turns the per-address rate limit off unless a test sets it                                                                          | The tests sign in many times from one address                                                                                 |
| The review found and fixed two issues: logs carried Drizzle's query parameters, and the provider's error text reached the browser                   | `docs/security.md`                                                                                                            |
| The review added tests for two outage paths: a draft edit that lists duplicates again, and a handoff with a related ticket                          | They were missing from the resilience checklist (S-11.10)                                                                     |
| The prompt order was not changed                                                                                                                    | The cache check showed 70–77% of input tokens cached once the reading was fixed                                               |
| The history reduction measured -5% overall and -8% on the longest scenario                                                                          | The reference conversations are short; the README says so                                                                     |
