# Stage 09 — Handoff and analyst console: tech spec

|        |                                                            |
| ------ | ---------------------------------------------------------- |
| Issue  | [#9](https://github.com/paulojnneto/service-desk/issues/9) |
| PRD    | `prd.md` (approved on 2026-10-29)                          |
| Status | Approved on 2026-10-29                                     |

## PRD clarification (approved with this spec)

Decision 1 says the employee's chat polls "when the conversation is not with the agent". Decision 4 lets an analyst take over a conversation that is still with the agent, and the employee must see that too. So the employee's chat polls whenever the page is visible and no reply is streaming, whatever the state. The poll is one small indexed query, so the cost is the same.

## Solution overview

```
employee chat ──poll 3 s──► GET /api/conversations/current/updates?after=<seq>
      │                         state, holder, analyst and system messages after seq
      └─ POST /api/chat ──► agent runs only "with_agent" (Stage 5) ──► transferirParaAnalista
                                                                         └─► handoffs row + system note
analyst console ──poll 3 s──► GET /api/analyst/conversations            (list, counts, search)
      │          ──poll 3 s──► GET /api/analyst/conversations/:id/updates?after=<seq>
      ├─ GET  /api/analyst/conversations/:id                            (history, handoffs, holder)
      ├─ GET  /api/analyst/conversations/:id/tickets                    (read as that employee)
      └─ POST /api/analyst/conversations/:id/{take-over,messages,hand-back,close}
```

- **Messages carry their order.** `messages.seq` (global identity, Stage 5) goes into each message's metadata. Both sides poll with `after=<highest seq seen>`, so an update returns only what is new. The answer is small and needs no session state on the server.
- **Handoff record.** The handoff service inserts a `handoffs` row (reason, summary, ticket, time) and a system note "Conversa transferida para o service desk", in the same transaction as the state change. The ticket's transfer event stays as in Stage 6.
- **Who holds a conversation.** `conversations` gains `holder_id` and `held_since`. They are set only in the state "with an analyst", which a check constraint enforces. Every console action is one conditional `UPDATE … WHERE state IN (…) [AND holder_id = …] RETURNING`, so two analysts acting at once get one winner. The loser gets `409` with the conversation's current holder.
- **Console actions.**

  | Action    | Allowed from                                    | New state      | Note                                |
  | --------- | ----------------------------------------------- | -------------- | ----------------------------------- |
  | Take over | `waiting_analyst`, `with_agent`                 | `with_analyst` | "Rafael Lima assumiu o atendimento" |
  | Reply     | `with_analyst`, by the holder                   | unchanged      | the analyst's message               |
  | Hand back | `with_analyst` by the holder; `waiting_analyst` | `with_agent`   | "Conversa devolvida ao Nexo Assist" |
  | Close     | `with_analyst` by the holder; `waiting_analyst` | `closed`       | "Atendimento encerrado"             |

- **The agent stays quiet.** This is Stage 5's rule, unchanged: the chat route runs the agent only when the state is `with_agent`. A reply that was already streaming when an analyst took over still finishes and is saved. The next message gets no reply.
- **The agent after a hand back.** `toAgentHistory` now keeps the analyst's messages and the system notes as assistant messages, in order, with a prefix ("[Analista Rafael Lima] …", "[Nota do sistema] …"). The instructions say that prefixed messages were written by a person or by the system, not by the agent. The order is kept, and the agent cannot mistake the analyst's words for its own.
- **When to hand off.** The rule lives in three places: the instructions, the tool's description and the scripted model.
  - The agent calls `transferirParaAnalista` directly only when the employee asked for a person in words, or the case is critical.
  - For an overdue ticket or low confidence, it first asks with `perguntar` ("Falar com um analista", …) and transfers only after that pick.
  - The scripted model's second "não entendi" becomes a question with options instead of text.
- **The analyst console** replaces the landing page at `/console` (Screens 4 and 5).
  - **Layout:** a rail, the conversation list, the history with the composer and the actions, and the panel with the employee's tickets.
  - **History:** it has its own message component, mirrored as in the prototype (the employee on the left; Nexo Assist and analysts on the right). It reuses the Stage 7 cards in read-only mode and the Stage 8 `DecisionDetail` behind "Por quê?".
  - **Selection:** the selected conversation is in the URL (`/console/:id`).
- **The employee's chat.**
  - **Analyst messages** show their name and level ("Rafael Lima · Suporte N2").
  - **System notes** use the existing `SystemNote`.
  - **The banner follows the state:** waiting; "Rafael Lima está atendendo você"; closed, with "Começar nova conversa".
  - **Updates** come from `useConversationUpdates`, which polls only while the tab is visible and no reply is streaming.
- **Sample conversations.** `apps/api/src/scripts/seed.ts` writes the Screen 4 states for Bruno, Carla, Diego, Elisa, Fábio and Gabriela, with handoffs and stored decision records. The root `pnpm db:seed` runs it after the tickets seed. It refuses to run with `NODE_ENV=production` and never touches Ana's conversations.

## Files and modules

| Path                                                       | What changes                                                                                                                       | Why                       |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `packages/shared/src/conversations.ts`                     | `MessageMetadata.seq`, `authorLevel`; `ConversationView.holder`; `ConversationUpdates`                                             | S-09.12                   |
| `packages/shared/src/console.ts`                           | `HandoffReason`, `HandoffView`, `ConsoleFilter`, `ConversationSummary`, `ConsoleList`, `AnalystConversationView`, `ConsoleTickets` | S-09.1, S-09.3 to S-09.6  |
| `packages/shared/src/directory.ts`                         | `analystLevelLabel` ("Suporte N2")                                                                                                 | Decision 12               |
| `apps/api/drizzle/0003_*.sql`, `src/db/schema.ts`          | `handoffs`; `conversations.holder_id`, `held_since`, with a check                                                                  | Decisions 2, 3            |
| `apps/api/src/conversations/repository.ts`                 | Handoff in one transaction; `takeOver`, `handBack`, `closeByAnalyst`, `appendAnalystMessage`; `listForConsole`; `messagesAfter`    | S-09.1, S-09.7 to S-09.9  |
| `apps/api/src/conversations/console.ts`, test              | Builds `ConversationSummary` (status, last message, last confidence, waiting time), filters, counts, search                        | S-09.3, S-09.4            |
| `apps/api/src/conversations/to-ui.ts`                      | `seq` and `authorLevel` in metadata; `holder` in the view; `toAgentHistory` with prefixed analyst and system messages              | S-09.11, S-09.12          |
| `apps/api/src/agent-services.ts`                           | `handoff` writes the handoff row and the note with the state                                                                       | S-09.1                    |
| `apps/api/src/routes/conversations.ts`                     | `GET /current/updates?after=`                                                                                                      | S-09.12                   |
| `apps/api/src/routes/analyst.ts`, test                     | List, detail (with handoffs and holder), updates, tickets, take over, reply, hand back, close                                      | S-09.3 to S-09.9, S-09.14 |
| `apps/api/src/scripts/seed.ts`, test; root `package.json`  | Sample conversations; `db:seed` runs both seeds                                                                                    | S-09.15                   |
| `packages/agent/src/agents/instructions.ts`, test          | The handoff rule; how to read prefixed messages                                                                                    | S-09.2, S-09.11           |
| `packages/agent/src/tools/handoff.ts`                      | Description with the rule                                                                                                          | S-09.2                    |
| `packages/agent/src/models/nexo-script.ts`                 | Offer first on low confidence; reads "[Analista …]" messages after a hand back                                                     | S-09.16                   |
| `apps/web/src/lib/use-conversation-updates.ts`             | Polling hook: interval, visibility, pause while streaming, `after` cursor                                                          | Decision 1                |
| `apps/web/src/lib/api.ts`                                  | Console calls and updates                                                                                                          |                           |
| `apps/web/src/components/chat/chat.tsx`, `messages.tsx`    | Merges updates; banner per state; analyst name and level; closed state                                                             | S-09.12, S-09.13          |
| `apps/web/src/components/chat/cards/*`                     | `readOnly` for the console: no picks, no draft buttons                                                                             | S-09.5                    |
| `apps/web/src/routes/analyst/console.tsx`                  | Console layout and routes `/console` and `/console/:id`; replaces `landing.tsx`                                                    | M6                        |
| `apps/web/src/components/console/conversation-list.tsx`    | Search, filters with counts, rows with status                                                                                      | S-09.3, S-09.4            |
| `apps/web/src/components/console/conversation-history.tsx` | Mirrored messages, handoff summary on top, `DecisionDetail`                                                                        | S-09.5                    |
| `apps/web/src/components/console/conversation-actions.tsx` | Take over, hand back, close, composer; waiting bar of Screen 4                                                                     | S-09.7 to S-09.9          |
| `apps/web/src/components/console/tickets-panel.tsx`        | "Desta conversa", "Outros chamados", collapsible below 1280 px                                                                     | S-09.6, decision 11       |
| `apps/web/src/components/console/status.ts`, test          | Status text and color of a row ("Transferida · INC-20311", "Agente pediu ajuda · confiança baixa")                                 | S-09.3                    |
| `apps/web/src/router.tsx`                                  | Console routes                                                                                                                     |                           |
| `README.md`                                                | Handoff, console, how to try both sides                                                                                            | S-09.17                   |

## Decisions

| Decision                                        | Choice                                                                                                                                                           | Alternatives considered                         | Reason                                                                                                                                               |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Update cursor                                   | `messages.seq`, exposed in the metadata                                                                                                                          | Timestamps; message ids                         | `seq` is already a global, increasing identity with an index; timestamps can tie, ids have no order                                                  |
| What the employee's poll returns                | The state, the holder, and the analyst's and system's messages after `seq`. Not the employee's own messages and not the agent's                                  | Every message after `seq`                       | The employee's messages are already on screen with the browser's ids, and agent replies arrive by the stream. Returning them would duplicate them    |
| What the console's poll returns                 | Every message after `seq`, the state, the holder and the latest handoff                                                                                          | The whole conversation each time                | Small answers every 3 s; the full view loads once when a conversation is opened                                                                      |
| List refresh                                    | The list route every 3 s, for the selected filter and search, with the counts                                                                                    | A cursor for the list                           | At most a few dozen rows. The query is one join with a lateral "last message" and "last decision"                                                    |
| Holder and state                                | Conditional `UPDATE`s; check `(state = 'with_analyst') = (holder_id IS NOT NULL)`                                                                                | Row lock and read-then-write                    | One statement per action, no window between the check and the write, and a database that refuses an impossible state                                 |
| Handoff and its note                            | One transaction: state, `handoffs` row, system note                                                                                                              | Note written by the tool afterwards             | A crash between them would leave a waiting conversation without its summary                                                                          |
| Handoff of a conversation already with a person | `transferirParaAnalista` answers `{ transferido: false }` and changes nothing                                                                                    | A second waiting row                            | The agent does not run in those states; the check only guards a reply already streaming                                                              |
| Agent history                                   | Analyst and system messages as assistant messages with a prefix, in order                                                                                        | A block in the instructions; user-role messages | Keeps the order of the conversation; a user role would make the analyst look like the employee. The prefix and one instruction line say who wrote it |
| Ticket panel                                    | The API reads `tickets.as(employeeId).list("all")` and `get(related)` for the conversation's employee, analyst route only                                        | An analyst role in the ticket service           | PRD decision 7: the ticket service and its R7 checks stay as they are                                                                                |
| Status of a row                                 | A pure function of the summary: waiting with a reason, with the agent and low confidence, held by me or by someone else, with the agent, closed                  | Stored status text                              | One place to test, the same words in the list and the header                                                                                         |
| History in the console                          | Own component, mirrored; cards in read-only mode                                                                                                                 | Reuse `AgentMessage` as is                      | Screens 4 and 5 put the employee on the left; the analyst must not pick options or confirm drafts for the employee                                   |
| Closed conversation in the chat                 | Banner "Atendimento encerrado" with "Começar nova conversa", which revalidates the page and gives a fresh chat. Typing also starts one, through the Stage 5 rule | Keep the old chat on screen and append          | The new conversation's history must not look like it continues the old one                                                                           |
| Seed                                            | A TypeScript script that writes through the repository functions, deleting and recreating only the sample employees' conversations                               | SQL fixtures                                    | Same code paths as the app, decision records included; Ana's conversation and the user's data are left alone                                         |
| Web tests                                       | Vitest on the row status, the updates merge and the polling hook's timing; manual check in two browser tabs                                                      | Testing Library and jsdom                       | Same as Stages 7 and 8                                                                                                                               |

## Contracts

```ts
// packages/shared/src/console.ts
export const HandoffReason = z.enum([
  "pedido_do_funcionario",
  "caso_critico",
  "chamado_vencido",
  "baixa_confianca",
]);
export type HandoffView = {
  reason: HandoffReason;
  summary: string;
  ticketNumber: string | null;
  at: string;
};
export type Holder = { id: string; name: string; level: string }; // level: "Suporte N2"

export const ConsoleFilter = z.enum(["para_voce", "com_agente", "minhas", "todas"]);
export type ConversationSummary = {
  id: string;
  employee: { id: string; name: string; department: string; initials: string; avatar: AvatarColors };
  state: ConversationState;
  holder: Holder | null;
  lastMessage: { author: MessageAuthor; text: string; at: string } | null;
  lastConfidence: Confidence | null;
  handoff: HandoffView | null; // the latest, while waiting or held
  updatedAt: string;
};
export type ConsoleList = {
  conversations: ConversationSummary[];
  counts: Record<ConsoleFilter, number>;
};
export type AnalystConversationView = ConversationView & {
  employee: ConversationSummary["employee"];
  handoffs: HandoffView[];
};
export type ConsoleTickets = { related: Ticket | null; others: Ticket[] };

// packages/shared/src/conversations.ts
MessageMetadata gains seq: number, authorLevel?: string
ConversationView gains holder: Holder | null
export type ConversationUpdates = {
  state: ConversationState;
  holder: Holder | null;
  messages: StoredMessage[];
};
```

Routes. Every console route is analyst only; employees get `403`.

```
GET  /api/conversations/current/updates?after=<seq>    (employee)
     200 ConversationUpdates | 200 { conversation: null } when none is open

GET  /api/analyst/conversations?filter=para_voce&q=ana  200 ConsoleList
GET  /api/analyst/conversations/:id                     200 { conversation: AnalystConversationView }
GET  /api/analyst/conversations/:id/updates?after=<seq> 200 ConversationUpdates & { handoffs }
GET  /api/analyst/conversations/:id/tickets             200 ConsoleTickets | 503 unavailable
POST /api/analyst/conversations/:id/take-over           200 { conversation } | 409 { error: "already_held", holder } | 409 closed
POST /api/analyst/conversations/:id/messages            { clientId, text } → 200 { message } | 409 not_holder | 400 invalid_input
POST /api/analyst/conversations/:id/hand-back           200 { conversation } | 409 not_holder | 409 closed
POST /api/analyst/conversations/:id/close               200 { conversation } | 409 not_holder
     400 invalid_id | 404 not_found | 503 unavailable on all of them
```

"Para você": `state = 'waiting_analyst'`, or `state = 'with_agent'` with a latest decision at `baixa`. "Minhas": `holder_id = me`. "Com o agente": `state = 'with_agent'`. "Todas": every open conversation, plus those closed in the last 7 days. Search matches the employee's name, ignoring accents, or a ticket number in the handoffs or in the message parts.

Migration `0003`:

```sql
create table handoffs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id),
  reason text not null check (reason in ('pedido_do_funcionario','caso_critico','chamado_vencido','baixa_confianca')),
  summary text not null,
  ticket_number text,
  created_at timestamptz not null
);
create index handoffs_conversation_idx on handoffs (conversation_id, created_at);
alter table conversations add column holder_id text, add column held_since timestamptz;
alter table conversations add constraint conversations_holder_check
  check ((state = 'with_analyst') = (holder_id is not null));
```

Before this stage, nothing could put a conversation in `with_analyst`, so the check holds for existing rows.

## Error handling

| What fails                                            | Employee sees                                                                                | Analyst sees                                                                     | Logs            |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------- |
| A poll fails (API restart, network)                   | Nothing; the next poll catches up from the same `after`                                      | A small "reconectando…" in the list header after 3 failures in a row             | —               |
| Take over lost to another analyst                     | —                                                                                            | "Júlia Castro já assumiu esta conversa." The view shows the holder; no composer  | —               |
| Reply or close after losing the conversation          | —                                                                                            | "Você não está mais com esta conversa." The view refreshes                       | —               |
| Ticket panel with the ticket service down             | —                                                                                            | "Não consegui carregar os chamados agora." with "Tentar de novo"; the rest works | `console.error` |
| Handoff with the ticket service down                  | As in Stage 6: the handoff still happens; only the ticket event is skipped. The note says it | The handoff shows its ticket; no event on the ticket                             | `console.error` |
| Employee sends while the conversation was just closed | The message starts a new conversation (Stage 5); the closed banner was already showing       | —                                                                                | —               |
| Database down                                         | `503` as before                                                                              | `503`: "Não consegui carregar as conversas." with "Tentar de novo"               | `console.error` |

## Test plan

| What                                                                                                                                                                                                                                                                     | Type                  | Why it is worth testing |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- | ----------------------- |
| Handoff writes the state, the handoff row and the note in one transaction; a second handoff while waiting or held changes nothing                                                                                                                                        | Integration (API)     | S-09.1                  |
| Take over from waiting and from with the agent; two at once give one `200` and one `409 already_held`                                                                                                                                                                    | Route                 | S-09.7, decision 3      |
| Reply only by the holder; does not count toward the limit; hand back and close by the holder or while waiting; `409` otherwise                                                                                                                                           | Route                 | S-09.8, S-09.9          |
| The check constraint refuses `with_analyst` without a holder and a holder in any other state                                                                                                                                                                             | Integration           | Decision 3              |
| Chat route: no agent run while waiting or held, even straight to the API; runs again after a hand back                                                                                                                                                                   | Route                 | S-09.10                 |
| `toAgentHistory` keeps the analyst's and system's messages, prefixed, in order                                                                                                                                                                                           | Unit (API)            | S-09.11                 |
| Updates: the employee gets the analyst's and system's messages after `seq`, never the other messages; the analyst gets all of them                                                                                                                                       | Route                 | S-09.12                 |
| List: each filter, the counts, search by name without accents and by ticket number, closed only in "Todas" and only for 7 days                                                                                                                                           | Route                 | S-09.3, S-09.4          |
| Tickets panel: the conversation's employee's tickets, the related one first; `503` when the ticket service is down                                                                                                                                                       | Route                 | S-09.6                  |
| Every console route answers `403` to employees and `401` without a session                                                                                                                                                                                               | Route                 | S-09.14                 |
| The seed writes each Screen 4 state, leaves Ana's conversation alone and refuses production                                                                                                                                                                              | Integration           | S-09.15                 |
| Scripted flows: overdue INC-20311 → options → "Falar com um analista" hands off with `chamado_vencido`; "Quero falar com um analista" hands off directly; two unclear messages offer an analyst with options; after a hand back the agent mentions what the analyst said | Flow (API, simulated) | S-09.2, S-09.16         |
| Instructions contain the handoff rule and the prefixed-message line                                                                                                                                                                                                      | Unit (agent)          | S-09.2, S-09.11         |
| Row status per state and reason; merging updates without duplicates; the polling hook stops when hidden or streaming                                                                                                                                                     | Unit (web)            | S-09.3, decision 1      |

Manual validation, two tabs (Ana and Rafael), simulated mode, on the user's running `pnpm dev`. The steps need `db:migrate` and `db:seed`, and I ask before running the seed, since it rewrites the sample conversations:

1. Ana: INC-20311 → "Falar com um analista". Rafael: the conversation is on top of "Para você", with the summary, the reason and INC-20311 in the panel.
2. Rafael takes over; Ana sees the note and the banner within 3 s. They exchange two messages each way.
3. A second analyst (Júlia Castro) tries to take over and reply: refused.
4. Rafael hands back; Ana writes; the agent answers knowing what Rafael said.
5. Diego's seeded conversation appears in "Para você" with "confiança baixa"; Rafael takes it over from the agent.
6. Rafael closes Fábio's; Ana's own close flow: "Atendimento encerrado", then a new conversation.
7. Widths 1440, 1024 and 768.
8. Real model, only after asking: the handoff rule (overdue, then an explicit request) and a hand back.

## Commit plan

1. `docs(stage-09): tech spec`
2. `feat(shared): console contracts, handoff reasons and message order`
3. `feat(api): handoffs table, conversation holder and a handoff with its summary`
4. `feat(api): take over, reply, hand back and close`
5. `feat(api): console list, conversation updates and the employee's tickets`
6. `feat(agent): offer an analyst first, and read the analyst after a hand back`
7. `feat(api): sample conversations for the console`
8. `feat(web): employee chat follows the analyst in near real time`
9. `feat(web): analyst console, list and history (screen 4)`
10. `feat(web): take over, reply, hand back and close (screen 5)`
11. `docs: handoff and analyst console in the README`

## Risks

| Risk                                                                                  | Mitigation                                                                                                                                                |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Polling every 3 s from many tabs loads the API                                        | Only visible tabs poll; each poll is one indexed query on `seq`. N12 rate limits come in Stage 11. SSE stays an option behind the same hook               |
| An agent reply streaming when the analyst takes over lands after the takeover note    | Accepted and visible in order; the agent does not answer the next message. Documented                                                                     |
| The prefixed analyst messages confuse a real model, which might answer as the analyst | One instruction line; the manual run checks it; Stage 10 measures                                                                                         |
| The console query gets slow with many conversations                                   | Indexes on `state`, `holder_id` and `updated_at`; closed conversations limited to 7 days; pagination left for when it matters                             |
| The seed overwrites data someone was using                                            | It touches only the six sample employees, never Ana, refuses production, and the README says what it does. I ask before running it on the user's database |
| Local echo duplicates a message (the analyst's own reply)                             | The reply route returns the stored message, which replaces the optimistic one by `clientId`; the merge is unit-tested                                     |
