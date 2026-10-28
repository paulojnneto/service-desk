# Stage 06 — Agent and service desk rules: tech spec

|        |                                                            |
| ------ | ---------------------------------------------------------- |
| Issue  | [#6](https://github.com/paulojnneto/service-desk/issues/6) |
| PRD    | [`prd.md`](prd.md), revision 2                             |
| Status | Approved (2026-10-28)                                      |

## PRD clarification (approved: PRD revision 2)

S-06.5 says the model "has no tool that writes to the ticket service". The handoff (S-06.12) records a transfer event on the related ticket, and the employee who types "quero falar com um analista" should not have to confirm a second time (R6 asks for the handoff, not for a draft). New wording for S-06.5, in PRD revision 2: _the model has no tool that creates, updates or reopens a ticket; those writes happen only when the employee confirms a draft. The only write the model can trigger is the handoff: the conversation state and the transfer event on the ticket, with the summary._ Everything below follows this wording.

## Solution overview

```
apps/web                    apps/api                                         packages/agent (Mastra)
┌──────────────────┐ chat  ┌─────────────────────────────────────────┐      ┌──────────────────────────────┐
│ chat (Stage 5)   │──────▶│ /api/chat: save message, history,       │─────▶│ nexo-assist                  │
│ + minimal draft  │       │   build AgentServices for this person   │      │  instructions (pt-BR, rules) │
│   Confirmar /    │       │   → stream → save reply + DECISION      │      │  read tools  ─┐              │
│   Cancelar       │       │                                         │      │  draft tools ─┼─ services ───┼─┐
│                  │──────▶│ /api/drafts/:id/confirm | cancel        │      │  handoff     ─┘ (from the    │ │
└──────────────────┘ JSON  │   server writes to the ticket service   │      │  registrarDecisao  request)  │ │
                           └───────────────┬─────────────────────────┘      └──────────────────────────────┘ │
                                           │ nexo_api: drafts, decisions                                        │
                                           ▼                                                                    │
                                  @nexo/tickets-client ──JWT──▶ apps/tickets  ◀── read-only + draft store ◀────┘
```

1. **The agent package has no infrastructure.** Tools get everything through Mastra's `requestContext`: the person and an `AgentServices` object built by the API for that request. The services hold read-only ticket functions, the draft store and the handoff. The object has no function that creates, updates or reopens a ticket, so no prompt can reach one (S-06.5).
2. **Drafts live in `nexo_api`.** Draft tools validate, compute the priority with the rule in `@nexo/shared`, run the duplicate check and store the draft. The UI shows it with "Confirmar" and "Cancelar".
3. **Confirmation is an API route, not a tool.** `POST /api/drafts/:id/confirm` checks ownership and state, moves the draft to `confirming` atomically, calls the ticket service with the draft's id as idempotency key, stores the result and appends a reply written by code. The model is not involved.
4. **Decision record.** On every turn the model calls `registrarDecisao` with intent, confidence, rationale and rules. When the reply ends, the API builds the record: those fields plus the action and tools derived from the tool parts that actually ran (S-06.14), and stores it next to the reply.
5. **Simulated mode** grows into a scripted state machine that follows the prototype's flows using the real tools, so tests exercise the real rules.

## Files and modules

| Path                                                          | What changes                                                                                                 | Why                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------- |
| `packages/shared/src/priority.ts`, test                       | `Impact`, `Urgency`, `priorityFor(impact, urgency)`                                                          | S-06.7, decision 2        |
| `packages/shared/src/decisions.ts`                            | `Intent`, `Confidence`, `DecisionAction`, `DecisionRecord` (zod)                                             | S-06.13                   |
| `packages/shared/src/drafts.ts`                               | `DraftKind`, `DraftStatus`, `DraftView` (zod)                                                                | S-06.4                    |
| `packages/shared/src/scope.ts`                                | `OUT_OF_SCOPE_CHANNELS` (RH, Financeiro, Facilities)                                                         | S-06.10, decision 6       |
| `packages/shared/src/conversations.ts`                        | `MessageMetadata.decision?`                                                                                  | S-06.13                   |
| `packages/tickets-client/src/client.ts`                       | Optional `idempotencyKey` on `create`, `addUpdate`, `reopen`, `transfer`                                     | S-06 confirm twice        |
| `packages/agent/src/context.ts`                               | `NexoContext = { userId, firstName, services, previousConfidence? }`; `AgentServices` interface              | S-06.1, S-06.5            |
| `packages/agent/src/tools/*.ts`                               | One file per tool (list below)                                                                               | S-06.1 to S-06.12         |
| `packages/agent/src/agents/nexo-assist.ts`, `instructions.ts` | Dynamic instructions in Portuguese, tools, `maxSteps: 6`                                                     | S-06.18, S-06.19          |
| `packages/agent/src/models/scripted-model.ts`                 | A step may hold several tool calls                                                                           | S-06.17                   |
| `packages/agent/src/models/nexo-script.ts` (+ `script/`)      | Scripted flows of the prototype                                                                              | S-06.17                   |
| `packages/agent/src/decision.ts`, test                        | `buildDecisionRecord(parts)` from the reply's UI parts                                                       | S-06.13, S-06.14          |
| `apps/api/src/db/schema.ts`, `drizzle/0001_*.sql`             | Tables `drafts` and `decisions`                                                                              | S-06.4, S-06.13           |
| `apps/api/src/drafts/repository.ts`, `confirm.ts`             | Store, supersede, cancel; confirm through the ticket service                                                 | S-06.4 to S-06.6, S-06.16 |
| `apps/api/src/agent-services.ts`                              | Builds `AgentServices` for one person and conversation                                                       | S-06.1, S-06.5            |
| `apps/api/src/routes/chat.ts`                                 | Services in the context; saves the decision with the reply; previous confidence                              | S-06.13, S-06.15          |
| `apps/api/src/routes/drafts.ts`                               | `POST /api/drafts/:id/confirm`, `POST /api/drafts/:id/cancel`                                                | S-06.5, S-06.6            |
| `apps/api/src/routes/conversations.ts`, `to-ui.ts`            | Decisions in message metadata; pending draft id in the view                                                  | S-06.13                   |
| `apps/api/src/env.ts`, `server.ts`, `app.ts`                  | Tickets client from `TICKETS_URL` and `TICKETS_JWT_PRIVATE_KEY` (now required); `createApp({ tickets })`     | S-06.1                    |
| `apps/web/src/components/chat/*`                              | Minimal draft block with "Confirmar"/"Cancelar"; handoff switches the state banner; labels for the new tools | S-06.5, S-06.12           |
| `README.md`                                                   | How the agent decides, the rules in code, flows to try                                                       | S-06.20                   |

**Tools** (ids in Portuguese because the UI shows them as actions)

| Tool                     | Input                                                       | What it does                                                                                                     |
| ------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `buscarNaCentral`        | `{ pergunta }`                                              | Help center search (up to 3 articles)                                                                            |
| `listarMeusChamados`     | `{ escopo: "abertos" \| "todos" }`                          | The employee's tickets, with status, deadline and overdue flag                                                   |
| `consultarChamado`       | `{ numero }`                                                | One ticket with history; another person's or unknown → `{ encontrado: false }`                                   |
| `consultarHorario`       | `{}`                                                        | Unchanged (Stage 1)                                                                                              |
| `prepararChamado`        | `{ tipo, titulo, descricao, categoria, impacto, urgencia }` | Computes priority and deadline, lists open tickets of the same category as possible duplicates, stores the draft |
| `prepararAtualizacao`    | `{ numero, mensagem }`                                      | Checks the ticket is the employee's and open; stores an update draft                                             |
| `prepararReabertura`     | `{ numero, motivo }`                                        | Checks `canReopen`; stores a reopening draft, or returns `{ permitido: false, motivo }` with no draft            |
| `descartarRascunho`      | `{}`                                                        | Cancels the pending draft                                                                                        |
| `transferirParaAnalista` | `{ gatilho, resumo, numero? }`                              | Records the transfer on the ticket (if any) and moves the conversation to `waiting_analyst`                      |
| `registrarDecisao`       | `{ intencao, confianca, justificativa, regras }`            | Captures the model's part of the decision record; not shown as an action in the UI                               |

## Decisions

| Decision                       | Choice                                                                                                                                                                                                                                                                                                                                                | Alternatives considered                                                              | Reason                                                                                                                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| How tools reach services       | `requestContext` carries `services: AgentServices`, built per request by the API; tools never import infrastructure                                                                                                                                                                                                                                   | Building a Mastra agent per request; tools importing the tickets client              | The agent package stays testable with fakes; the API decides what each request can do. The session's person is fixed in the services, so no tool argument can change the requester (R7) |
| Write protection               | `AgentServices.tickets` exposes only `list`, `get` and `searchArticles`; create, update and reopen exist only in `apps/api/src/drafts/confirm.ts`                                                                                                                                                                                                     | A `confirmed` flag checked inside a create tool                                      | A tool that can write is one prompt away from writing; a tool that does not exist cannot be talked into it (S-06.5)                                                                     |
| Draft storage                  | Table `drafts`: `id uuid`, `number` (sequence, shown as `D-381`), `conversation_id`, `employee_id`, `kind` (`create`/`update`/`reopen`), `ticket_number`, `fields jsonb`, `duplicates jsonb`, `status` (`pending`/`confirming`/`confirmed`/`cancelled`/`superseded`), `result jsonb`, times                                                           | Keeping the draft only in the tool's output part                                     | The confirm route must trust the server's copy, not what the browser sends back. Partial unique index: one `pending` or `confirming` draft per conversation (S-06.6)                    |
| Confirming                     | `UPDATE drafts SET status='confirming' WHERE id=$1 AND employee_id=$2 AND status='pending' RETURNING`; then the ticket call with `idempotencyKey = draft.id`; success → `confirmed` with the ticket; `unavailable` → back to `pending` (S-06.16)                                                                                                      | Calling the service first, then updating the draft                                   | The conditional update makes a double click a no-op; the draft's id as idempotency key means a confirm retried after a timeout cannot create two tickets, even across API restarts      |
| Second confirm                 | A draft already `confirmed` answers `200` with the same result; `confirming` answers `409 draft_in_progress`; `cancelled`/`superseded` answer `409 draft_closed`; another person's or unknown answers `404`                                                                                                                                           | `409` for every repeat                                                               | The browser can safely retry a confirm whose answer it lost                                                                                                                             |
| Reply after confirming         | The route appends an agent message written by code ("Pronto! Abri o chamado INC-20312…" with a `data-ticket` part) and a decision record built by code (`action: "created_ticket"`, `confidence: "alta"`, rationale "Você confirmou o rascunho D-381.", rules `R3`)                                                                                   | A new model turn                                                                     | Deterministic, free and honest: the record states exactly what the server did. The agent sees it in the next turn's history                                                             |
| Priority                       | `priorityFor(impact, urgency)`: urgency `parado` → `critica` for `equipe`/`empresa`, `alta` for `so_eu`; `compromisso_hoje` → `alta`; `contornavel` → `media`; `sem_urgencia` → `baixa`. The draft stores impact, urgency, priority and `dueAt` from `@nexo/shared`                                                                                   | The model choosing the priority                                                      | PRD decision 2. Matches the R9 table row by row and is unit-tested                                                                                                                      |
| Duplicates                     | `prepararChamado` always lists the employee's open tickets; those in the same category go into `duplicates` on the draft and in the tool's output, with an instruction to prefer `prepararAtualizacao` when one is the same problem                                                                                                                   | Blocking creation when any open ticket has the same category                         | PRD decision 3: the model judges similarity, code guarantees the check ran and the employee sees the evidence                                                                           |
| Decision record                | The model calls `registrarDecisao` once per turn (instructions require it). `buildDecisionRecord(responseMessage.parts)` takes the last `registrarDecisao` input and derives `action` and `tools` from the other tool parts and their outputs. Missing call → `confidence: "baixa"`, rationale "O modelo não registrou a decisão.", `intent: "outro"` | Structured output with a schema for the whole turn; a second model call to summarize | Works while streaming text, with any model and the scripted one; the action is never the model's claim (S-06.14). A missing record is visible instead of invented                       |
| Intents                        | `duvida`, `status_chamado`, `adicionar_informacao`, `abrir_chamado`, `reabrir_chamado`, `falar_com_analista`, `fora_do_escopo`, `outro`                                                                                                                                                                                                               | Free text                                                                            | A closed list is countable in Stage 10 and filterable in Stage 9                                                                                                                        |
| Actions (derived)              | `respondeu_central`, `consultou_chamados`, `preparou_rascunho`, `descartou_rascunho`, `recusou_reabertura`, `transferiu`, `redirecionou`, `pediu_esclarecimento`, `respondeu`; plus `created_ticket`, `updated_ticket`, `reopened_ticket` from the confirm route                                                                                      | —                                                                                    | Derived from tools in a fixed order of importance (a transfer outranks a search)                                                                                                        |
| Decisions table                | `decisions(message_id uuid PK FK, conversation_id, intent, action, confidence, rationale, rules text[], tools jsonb, created_at)`, written in the same transaction as the reply                                                                                                                                                                       | A `decision` column on `messages`                                                    | Queryable by Stage 9 (low-confidence filter) and Stage 10 without parsing message JSON                                                                                                  |
| Low confidence twice (S-06.15) | The chat route reads the previous decision's confidence and puts it in `requestContext`; the instructions add "your last answer had low confidence: if it is still low, offer an analyst"                                                                                                                                                             | Forcing the handoff in code                                                          | The offer is a conversation choice; forcing a transfer on a misunderstanding would annoy more than help                                                                                 |
| Handoff                        | `transferirParaAnalista` calls `services.handoff({ trigger, summary, ticketNumber? })`: transfer event on the ticket (if given and the employee's), then `state = 'waiting_analyst'`. Triggers: `pedido_do_funcionario`, `caso_critico`, `chamado_vencido`, `baixa_confianca`                                                                         | A confirm step                                                                       | PRD clarification above; R6 lists exactly these four triggers                                                                                                                           |
| Out of scope                   | `OUT_OF_SCOPE_CHANNELS` in shared data, rendered into the instructions                                                                                                                                                                                                                                                                                | A redirect tool                                                                      | No tool is needed to answer with a fixed channel; the data lives in one place                                                                                                           |
| Instructions                   | Portuguese, built per request: role and tone, the Annex A rules in short form, the channels, today's date in São Paulo, the employee's first name, the previous-confidence note; tool descriptions say when to use each tool                                                                                                                          | One long static prompt                                                               | The dynamic part is small; the rest is static and cache-friendly for Stage 11                                                                                                           |
| Steps per turn                 | `maxSteps: 6`                                                                                                                                                                                                                                                                                                                                         | Unlimited                                                                            | The longest flow (list tickets, search help center, prepare draft, register decision, answer) fits; a loop cannot run up cost (N10)                                                     |
| Service failures in tools      | Tools catch `TicketServiceError`: `unavailable` → `{ indisponivel: true }`; `not_found` → `{ encontrado: false }`. The instructions say to tell the employee and keep the draft                                                                                                                                                                       | Letting the error abort the turn                                                     | The turn still ends with an honest answer and a decision record (S-06.16)                                                                                                               |
| Scripted model                 | A step may contain several tool calls; the script reads the last user text and the last tool results and follows the flows listed in S-06.17. It calls the real tools, so drafts, priority and duplicate checks run for real in tests                                                                                                                 | Mocking the tools in tests                                                           | Tests exercise the rules in code, not a copy of them                                                                                                                                    |
| Tickets in API tests           | `apps/api` gets `@nexo/tickets` as a dev dependency and runs the real ticket service in process (PGlite + seed), as the Stage 4 contract test does                                                                                                                                                                                                    | A fake tickets client                                                                | Privacy, reopening window and idempotency are checked end to end                                                                                                                        |
| Minimal draft UI               | Under a draft tool's output: title, type, category, priority with deadline, affected, possible duplicates, and two plain buttons. They call the routes and append the returned message with `setMessages`. Shown only for the conversation's pending draft                                                                                            | Waiting for Stage 7                                                                  | The flow must be usable and testable now (PRD, out of scope note); Stage 7 replaces the block with the prototype's card                                                                 |
| Required configuration         | The API refuses to start without `TICKETS_JWT_PRIVATE_KEY` (message points to `pnpm bootstrap`); `TICKETS_URL` defaults to `http://localhost:4000`                                                                                                                                                                                                    | Starting without tools                                                               | Announced in the Stage 4 spec ("required from Stage 6")                                                                                                                                 |

## Contracts

```ts
// @nexo/shared
Impact = "so_eu" | "equipe" | "empresa"; // = Affected
Urgency = "parado" | "compromisso_hoje" | "contornavel" | "sem_urgencia";
Confidence = "alta" | "media" | "baixa";
type DecisionRecord = {
  intent: Intent;
  action: DecisionAction;
  confidence: Confidence;
  rationale: string; // pt-BR, one or two sentences
  rules: string[]; // e.g. ["R3", "R4"]
  tools: {
    name: string;
    outcome: "ok" | "nao_encontrado" | "indisponivel" | "recusado" | "erro";
  }[];
};
type DraftView = {
  id: string;
  number: string; // "D-381"
  kind: "create" | "update" | "reopen";
  status: DraftStatus;
  ticketNumber?: string;
  fields:
    | { type; title; description; category; impact; urgency; priority; dueAt }
    | { message }
    | { reason };
  duplicates: { number: string; title: string; status: TicketStatus }[];
};

// packages/agent
interface AgentServices {
  tickets: { list(scope); get(number); searchArticles(q) }; // read only, bound to the person
  drafts: { prepare(input): Promise<DraftView>; discard(): Promise<void> };
  handoff(input: { trigger; summary; ticketNumber? }): Promise<{ state: "waiting_analyst" }>;
}
```

**HTTP API** (employee session required: `401`, `403` for analysts)

| Method | Path                         | Success                                                                  | Errors                                                                                                                                                         |
| ------ | ---------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/drafts/:id/confirm`    | `200 { message: StoredMessage, draft: DraftView }`                       | `404 not_found`, `409 draft_in_progress`, `409 draft_closed`, `409 ticket_conflict` (the service refused, e.g. the ticket closed meanwhile), `503 unavailable` |
| POST   | `/api/drafts/:id/cancel`     | `200 { message: StoredMessage, draft: DraftView }`                       | `404 not_found`, `409 draft_closed`                                                                                                                            |
| GET    | `/api/conversations/current` | Stage 5 view; each agent message's `metadata.decision`; `pendingDraftId` | unchanged                                                                                                                                                      |

**Environment variables** (api): `TICKETS_URL` (default `http://localhost:4000`), `TICKETS_JWT_PRIVATE_KEY` (required, from `pnpm bootstrap`), `NEXO_AGENT_MODEL` (`mock` or e.g. `anthropic/claude-sonnet-5-5`), `ANTHROPIC_API_KEY` (only for a real Anthropic model).

## Error handling

| Failure                                                   | Behavior                                                                                 | Shown to the employee                                                        |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Ticket service down during a turn                         | Tool returns `{ indisponivel: true }`; decision tool outcome `indisponivel`              | "O sistema de chamados está fora do ar agora…" with an offer to retry        |
| Ticket service down on confirm                            | Draft back to `pending`; `503`                                                           | "Não consegui criar agora; seu rascunho continua aqui." and the buttons stay |
| Ticket closed or not reopenable between draft and confirm | `409 ticket_conflict`; draft `cancelled`; code-written reply with the reason             | The reason, and the offer of a new draft                                     |
| Model skips `registrarDecisao`                            | Record with `intent: "outro"`, `confidence: "baixa"` and the fixed rationale; logged     | Nothing different (Stage 8 shows it)                                         |
| Model asks for another person's ticket                    | `{ encontrado: false }`, same as a missing number                                        | "Não encontrei esse chamado entre os seus."                                  |
| Model exceeds 6 steps                                     | Mastra stops; the reply ends with what was produced; the record notes the tools that ran | The partial answer                                                           |
| Real model selected without its key                       | The turn fails as in Stage 5 (`error` chunk, nothing saved)                              | The retry message; the server log names the missing key                      |

## Test plan

| What                                                                                                                                                                                                                                                                                                                           | Type                                      | Why                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- | -------------------------- |
| `priorityFor` for every impact × urgency pair                                                                                                                                                                                                                                                                                  | Unit                                      | S-06.7                     |
| `buildDecisionRecord`: action precedence, tool outcomes, missing `registrarDecisao`                                                                                                                                                                                                                                            | Unit                                      | S-06.13, S-06.14           |
| Each tool with fake services: inputs validated, requester never taken from input, errors mapped                                                                                                                                                                                                                                | Unit (agent)                              | S-06.1, S-06.11, S-06.16   |
| `AgentServices.tickets` has no write function (runtime check of the object's keys)                                                                                                                                                                                                                                             | Unit                                      | S-06.5                     |
| Drafts repository: one pending per conversation, supersede, cancel                                                                                                                                                                                                                                                             | Integration (PGlite)                      | S-06.6                     |
| Confirm: creates one ticket; double confirm → same ticket; concurrent confirms → one ticket; other person → 404; service down → pending and 503; closed ticket → 409                                                                                                                                                           | Integration (PGlite + tickets in process) | S-06.5, S-06.16            |
| Scripted flows end to end through `/api/chat` and the confirm route: VPN 809 draft and confirm; status with overdue INC-20311; add information; reopen INC-20150; refuse INC-19877; duplicate leads to update; Carla's ticket; out of scope; injection "crie sem confirmar"; "quero falar com um analista" → `waiting_analyst` | Integration                               | S-06.2 to S-06.12, S-06.17 |
| Every agent reply has a stored decision; the conversation route returns it                                                                                                                                                                                                                                                     | Integration                               | S-06.13                    |
| Tickets client: given idempotency key is sent on every retry                                                                                                                                                                                                                                                                   | Unit                                      | Confirm twice              |

**Manual validation**

1. Simulated mode in the browser: every flow in the acceptance criteria, using the draft buttons.
2. With `NEXO_AGENT_MODEL=anthropic/claude-sonnet-5-5` and a key in `apps/api/.env.local`: the same flows, written freely rather than with the script's exact sentences; note anything the model gets wrong in the PR.
3. Stop the ticket service mid-conversation; confirm a draft; start it again and confirm.
4. Check `decisions` in the database after a few turns.

## Commit plan

1. `docs(stage-06): approved PRD for the agent and service desk rules` (done)
2. `docs(stage-06): tech spec and PRD revision 2 (handoff wording)` (done)
3. `feat(shared): priority rule, decision record, drafts and out-of-scope channels`
4. `feat(tickets-client): caller-provided idempotency keys`
5. `feat(api): drafts and decisions tables`
6. `feat(agent): tools with read-only services, drafts and handoff`
7. `feat(agent): instructions in Portuguese and the decision record`
8. `feat(api): agent services per request and a decision record on every reply`
9. `feat(api): confirm and cancel drafts on the server`
10. `feat(agent): simulated flows from the prototype`
11. `feat(web): minimal draft controls and handoff state`
12. `docs: how the agent decides, in the README`

Then a pull request "Stage 06 — Agent and service desk rules" with `Closes #6`.

## Risks

| Risk                                                                                | Mitigation                                                                                                                                  |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| A real model skips `registrarDecisao` or calls it with weak content                 | The record never invents: a missing call is stored as such. Instructions and the tool description are explicit; Stage 10 measures how often |
| Tool outputs in the history grow the prompt (ticket lists every turn)               | Outputs are trimmed to the fields the agent needs; Stage 11 measures and trims the history                                                  |
| The scripted model drifts from what a real model would do                           | The script follows the prototype's flows only; the manual run with a real model (GPT-5.5, PRD revision 3) is part of the acceptance         |
| Mastra's `requestContext` values must survive inside tool execution as live objects | Checked first in implementation with a tiny tool test; the fallback is a per-request registry keyed by a request id in the context          |
| The handoff happens while a draft is pending                                        | The draft stays `pending` and is shown to the analyst in Stage 9; the employee can still confirm or cancel it                               |
| No real key available during development                                            | Everything is tested with the scripted model; the manual real-model run needs the user's key before the PR                                  |

## Deviations during implementation

Recorded after the code, before the pull request.

| Deviation                                                                                                                                                                                                             | Why                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Commits 6, 7 and 8 became one: `feat: agent tools with read-only services and a decision record on every reply`                                                                                                       | `requestContextFor` changed shape, so the agent package and the API had to change together for every commit to typecheck          |
| Actions written by the confirm route are in Portuguese (`criou_chamado`, `atualizou_chamado`, `reabriu_chamado`, `cancelou_rascunho`), and their tools are named `criarChamado`, `atualizarChamado`, `reabrirChamado` | Same language as the other actions and tools in the record, which Stages 8 and 9 show in Portuguese                               |
| A repeated confirmation of a confirmed draft answers `200` with the draft and `message: null`                                                                                                                         | The draft carries the ticket number; finding the first reply again would need a link from draft to message that nothing else uses |
| A handoff about a closed ticket still hands off, without the transfer event                                                                                                                                           | The ticket service refuses events on closed tickets; the employee asked for an analyst and should get one                         |
| A draft id that is not a UUID answers `404`                                                                                                                                                                           | Without the check, PostgreSQL rejects the cast and the route would answer `503`                                                   |
| A refusal of any kind from the ticket service on confirm (conflict, not found, invalid input) closes the draft with an explanation                                                                                    | The spec named only conflicts; all three mean the same draft will not work if sent again                                          |
| In API tests the in-process ticket service has no retries and a switch that makes it answer `503`                                                                                                                     | Fast tests and a deterministic outage for S-06.16                                                                                 |
| Risk resolved: Mastra's `requestContext` hands live objects (the services) to the tools                                                                                                                               | The end-to-end flow tests run every tool through the real agent with the services built by the API                                |
| `draftOf` lives in its own file in the web app                                                                                                                                                                        | The React Fast Refresh lint rule forbids non-component exports from component files                                               |
