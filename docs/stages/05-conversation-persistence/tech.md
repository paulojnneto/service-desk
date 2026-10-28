# Stage 05 — Conversation persistence: tech spec

|        |                                                            |
| ------ | ---------------------------------------------------------- |
| Issue  | [#5](https://github.com/paulojnneto/service-desk/issues/5) |
| PRD    | [`prd.md`](prd.md) (approved on 2026-10-28)                |
| Status | Approved (2026-10-28)                                      |

## Solution overview

```
Browser (apps/web)                          apps/api (Hono, port 3001)
┌───────────────────────────────┐  /api  ┌──────────────────────────────────────────────────────┐
│ support loader:               │ ─────▶ │ session middleware: cookie {sid} → sessions table     │
│  GET /api/conversations/current│        │ GET  /api/conversations/current   history + state     │
│ useChat (initial = stored)    │        │ POST /api/conversations/current/close  "Nova conversa"│
│  sends ONLY the new message   │ ─────▶ │ POST /api/chat                                        │
│ "Nova conversa" in the top bar│        │   1. save the employee message (limit, atomically)    │
└───────────────────────────────┘ ◀───── │   2. load the history from the database               │
                                  stream │   3. agent (Mastra) → stream → save the reply at end  │
                                         └───────────────────────────┬──────────────────────────┘
                                                                     ▼
                                          PostgreSQL (Docker, host port 55432)
                                            nexo_api: conversations, messages, sessions  ← this stage
                                            nexo_tickets (Stage 4, unchanged)
```

1. **The API owns `nexo_api`** with the same tooling as the ticket service in Stage 4: Drizzle schema, generated SQL migrations committed in `apps/api/drizzle`, a migrate script, and PGlite in tests. `pnpm db:migrate` migrates both databases.
2. **The server is the source of the history.** The browser sends only the new message (text parts only). The route saves it, reads the stored conversation and gives that history to the agent. Whatever else the body carries is never read (S-05.6).
3. **The limit is a counter on the conversation row,** incremented in the same transaction that saves the employee message, with a condition `employee_messages < 30`. The row lock makes two simultaneous sends safe (S-05.9).
4. **The agent's reply is saved when its stream ends successfully.** The route wraps Mastra's stream in the AI SDK's `createUIMessageStream`, whose `onEnd` hands over the complete reply message. A copy of the stream is consumed on the server, so the reply is saved even if the browser closes mid-reply.
5. **One open conversation per employee,** guaranteed by a partial unique index. No route accepts a conversation ID: the conversation is always "the open one of the session's person", so another person's conversation cannot even be named (S-05.13).
6. **Sign-in sessions move to the database.** The cookie keeps its name and its sealing, but now holds only a random session ID; the `sessions` table holds the person, the role and the expiry. Signing out deletes the row (S-05.16, S-05.17).

## Files and modules

| Path                                                                  | What changes                                                                                                     | Why                       |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `packages/shared/src/conversations.ts`                                | zod contracts: states, authors, message metadata, the conversation view, error codes                             | S-05.2, S-05.3            |
| `packages/shared/src/service-desk.ts`                                 | `MESSAGES_PER_SESSION` documented as "per conversation" (PRD decision 1)                                         | S-05.9                    |
| `apps/api/src/db/schema.ts`, `drizzle.config.ts`, `drizzle/*.sql`     | Tables `conversations`, `messages`, `sessions`; generated migration                                              | S-05.1 to S-05.4, S-05.16 |
| `apps/api/src/db/connect.ts`, `test-db.ts`                            | `node-postgres` pool; PGlite with the migrations for tests (same shape as `apps/tickets`)                        | S-05.14, tests            |
| `apps/api/src/scripts/migrate.ts`                                     | Applies the API's migrations                                                                                     | S-05.1                    |
| `apps/api/src/env.ts`                                                 | `databaseUrl()` with the development default, as in `apps/tickets`                                               | S-05.1                    |
| `apps/api/src/conversations/repository.ts`                            | Every read and write, always with the employee's ID: open, append, count, close, load history                    | S-05.4 to S-05.13         |
| `apps/api/src/conversations/to-ui.ts`                                 | Stored rows ↔ AI SDK `UIMessage` (with author and time in `metadata`); history for the agent                     | S-05.3, S-05.5            |
| `apps/api/src/routes/conversations.ts`                                | `GET /current`, `POST /current/close`                                                                            | S-05.5, S-05.11           |
| `apps/api/src/routes/chat.ts`                                         | New body (one message), save → history → agent → save reply; state check; limit errors                           | S-05.6 to S-05.12         |
| `apps/api/src/session.ts`, `auth.ts`                                  | Sealed `{ sid }`, lookup in `sessions`, delete on sign-out, 7-day "Manter conectado"                             | S-05.16 to S-05.18        |
| `apps/api/src/app.ts`, `server.ts`                                    | `createApp({ db, now? })`; the server connects to `DATABASE_URL`                                                 | S-05.1                    |
| `apps/api/.env.example`, `apps/api/package.json`, root `package.json` | `DATABASE_URL`; `db:generate`/`db:migrate` in the API; root `db:migrate` runs both apps                          | S-05.1, N7                |
| `apps/web/src/lib/api.ts`                                             | `fetchCurrentConversation()`, `closeConversation()`                                                              | S-05.5, S-05.11           |
| `apps/web/src/router.tsx`, `routes/employee/support.tsx`              | Support route loader loads the conversation; "Nova conversa" action                                              | S-05.5, S-05.11           |
| `apps/web/src/components/chat/chat.tsx`                               | Starts from the stored messages, sends only the new one, limit error, state banner, "Nova conversa" at the limit | S-05.5, S-05.9 to S-05.12 |
| `apps/web/src/components/chat/new-conversation.tsx`                   | Button and confirmation dialog                                                                                   | S-05.11                   |
| `README.md`                                                           | Where conversations live, the server-side limit, "Nova conversa", revocable sessions                             | S-05.15                   |

## Decisions

| Decision                              | Choice                                                                                                                                                                                                                                                      | Alternatives considered                                     | Reason                                                                                                                                                                                                             |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Where conversations are stored        | Our own tables in `nexo_api`, with Drizzle, owned by `apps/api`                                                                                                                                                                                             | Mastra Memory with `@mastra/pg` (threads and resources)     | Mastra's threads know only user, assistant and system roles, not analysts, and have no conversation state or message limit. Stage 9 needs all three, and the privacy rule is easier to prove in our own repository |
| Tooling                               | Same as Stage 4: Drizzle 0.45, `drizzle-kit` migrations committed, PGlite 0.5 in tests; `connect.ts` and `test-db.ts` copied (about 30 lines)                                                                                                               | A shared `packages/db`                                      | Each service owns its database (N8); the copied helpers are tiny and do not justify a package that both services would depend on                                                                                   |
| Message format                        | Each message stores the AI SDK `UIMessage` `parts` as `jsonb`, plus `author`, optional `author_id` (analyst), `created_at` and an ordering `seq`. The API returns them as `UIMessage` with `metadata: { author, authorName?, createdAt }`                   | Plain text columns; Mastra's internal message format        | `parts` is exactly what the UI renders (text, tool calls and results), so a reload looks the same (S-05.3) and Stages 7 and 8 get their cards back for free                                                        |
| Roles in `UIMessage`                  | Employee → `user`; agent, analyst and system → `assistant`, told apart by `metadata.author`                                                                                                                                                                 | Custom roles                                                | `useChat` only knows `user`, `assistant` and `system`; the UI chooses the bubble from the author                                                                                                                   |
| History given to the agent            | Employee and agent messages only, in order. Analyst and system messages are stored and shown, but how the agent reads them is decided in Stage 9                                                                                                            | Sending everything as assistant messages                    | Presenting an analyst's words as the agent's own would mislead the model; nothing produces those messages before Stage 9 anyway                                                                                    |
| Request body                          | `{ message: { id, parts }, trigger? }`; only `text` parts are kept, at most 4,000 characters in total; `useChat`'s `prepareSendMessagesRequest` sends only the last message                                                                                 | Keep sending the whole history and ignore it                | Sending a history that is never read invites confusion; a small body makes "the server is the source" visible in the contract                                                                                      |
| Limit                                 | `conversations.employee_messages` counter. Saving an employee message runs `UPDATE … SET employee_messages = employee_messages + 1 WHERE id = $1 AND employee_messages < 30 AND state <> 'closed' RETURNING`, then inserts the message, in one transaction  | `SELECT count(*)` before inserting                          | Count-then-insert lets two simultaneous requests both pass at 29. The conditional update takes a row lock, so the second one waits and then fails the condition                                                    |
| Duplicate sends and retries           | The client's message ID is stored as `client_id`, unique per conversation. A send whose `client_id` already exists is not saved or counted again. Then the agent runs only if the last stored message is the employee's; otherwise `409 already_answered`   | Trusting `trigger: "regenerate-message"` alone              | One rule covers a retry after a failure, a double click and a resent request, whatever the trigger says (S-05.8)                                                                                                   |
| Saving the reply                      | `createUIMessageStream({ originalMessages: history, generateId, execute: merge(Mastra stream), onEnd })`; `onEnd` saves `responseMessage` only when the outcome is success. `createUIMessageStreamResponse({ consumeSseStream })` drains a copy server-side | Saving chunks as they stream; saving in Mastra's `onFinish` | One write per reply, with the same `parts` the browser assembled. Draining a copy means closing the tab mid-reply still saves it. A failed reply is not saved, so the retry produces a clean one                   |
| Conversation creation                 | On the first employee message: `INSERT … ON CONFLICT DO NOTHING` against the partial unique index `(employee_id) WHERE state <> 'closed'`, then read the open one                                                                                           | Creating it when the support screen opens                   | No empty conversations; two tabs sending the first message at once end up in the same conversation                                                                                                                 |
| Agent paused outside "with the agent" | The route saves the message, then, if the state is not `with_agent`, answers a stream with only a transient `data-conversation-state` part and no assistant message; the UI shows a banner "Sua conversa está com a equipe de atendimento"                  | `409` after saving; not saving                              | PRD S-05.12 asks to save the message. A stream keeps the `useChat` contract (no error, no retry button) and Stage 9 reuses the same part for live state changes                                                    |
| Conversation IDs                      | Never accepted from the client; every route works on "the open conversation of the session's person". IDs are UUIDs and appear only as React keys                                                                                                           | `/api/conversations/:id` with an ownership check            | A route that cannot name another conversation cannot leak one (S-05.13). The analyst console in Stage 9 adds its own ID-based routes for analysts                                                                  |
| "Nova conversa"                       | `POST /api/conversations/current/close` sets `state = 'closed'` and `closed_at`; it is a no-op `204` when there is no open conversation. The button sits in the top bar, opens a confirmation, and appears also in the limit message                        | Closing on sign-out; closing by inactivity                  | PRD decision 2. Idempotent, so a double click or a retry is harmless                                                                                                                                               |
| Loading the conversation in the UI    | The support route's loader calls `GET /api/conversations/current`; `<Chat key={conversation?.id ?? "new"}>` starts `useChat` with the stored messages; after "Nova conversa" the loader revalidates and the new key resets the chat                         | Fetching in a `useEffect`                                   | Same reason as Stage 3: no flash of an empty chat before the history arrives                                                                                                                                       |
| Counter                               | The UI counts `user` messages in its list, which starts with every stored one, so it equals the stored count after a reload; the server's `409 message_limit_reached` is the authority                                                                      | A separate count field kept in sync                         | One source for both history and count; the server still refuses the 31st even if the UI is wrong                                                                                                                   |
| Session storage                       | Table `sessions(id_hash, person_id, role, expires_at, created_at)`. The cookie seals `{ sid }`, 32 random bytes; the table stores its SHA-256, so a database dump holds no usable session                                                                   | Storing the raw ID; a JWT with a deny-list                  | PRD decision 4. Hashing costs nothing and protects against a leaked table. A deny-list keeps the same lookup per request with less clarity                                                                         |
| Session checks                        | The middleware unseals the cookie, looks up the hash with `expires_at > now`, and still checks the person and role against the directory. Expired rows are deleted at each sign-in                                                                          | A periodic cleanup job                                      | No scheduler needed; the table stays small for a prototype. Cookies issued before this stage have no `sid` and count as signed out                                                                                 |
| Durations                             | `REMEMBER_TTL_SECONDS` = 7 days; `WORKDAY_TTL_SECONDS` = 10 hours, both for the cookie's `Max-Age`, the seal's TTL and `expires_at`                                                                                                                         | Sliding expiry                                              | PRD decision 5; a fixed expiry is simpler to reason about and to test                                                                                                                                              |
| Database unavailable                  | Routes that need the database answer `503 { error: "unavailable" }`; the session middleware treats a failed lookup as `503`, not as signed out                                                                                                              | Treating it as signed out                                   | Sending everyone to the sign-in screen during a database blip would be confusing; the UI already has error states with retry                                                                                       |

## Contracts

**Shared vocabulary** (`@nexo/shared`)

```ts
ConversationState = "with_agent" | "waiting_analyst" | "with_analyst" | "closed"; // open = not closed
MessageAuthor = "employee" | "agent" | "analyst" | "system";
type MessageMetadata = { author: MessageAuthor; authorName?: string; createdAt: string }; // ISO 8601

type ConversationView = {
  id: string;
  state: ConversationState;
  employeeMessages: number; // stored count
  limit: number; // MESSAGES_PER_SESSION
  startedAt: string;
  messages: UIMessage<MessageMetadata>[]; // in order
};

ChatErrorCode = "message_limit_reached" | "already_answered" | "invalid_input" | "unavailable";
```

**Tables** (`nexo_api`)

| Table           | Columns                                                                                                                                                  | Constraints and indexes                                                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `conversations` | `id uuid`, `employee_id text`, `state` (enum), `employee_messages int default 0`, `started_at`, `updated_at`, `closed_at` (null)                         | Unique `(employee_id) WHERE state <> 'closed'`; check `employee_messages BETWEEN 0 AND 30`   |
| `messages`      | `id uuid`, `conversation_id uuid`, `seq bigint identity`, `author` (enum), `author_id text` (null), `client_id text` (null), `parts jsonb`, `created_at` | FK to `conversations`; unique `(conversation_id, client_id)`; index `(conversation_id, seq)` |
| `sessions`      | `id_hash text`, `person_id text`, `role text`, `created_at`, `expires_at`                                                                                | Primary key `id_hash`; index `expires_at`                                                    |

**HTTP API** (all under the existing `session` middleware; every route below needs an employee session: `401 unauthenticated`, `403 forbidden` for analysts)

| Method | Path                               | Body                                                                     | Success                                                                        | Errors                                                                                                |
| ------ | ---------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| GET    | `/api/conversations/current`       | —                                                                        | `200 { conversation: ConversationView \| null }`                               | `503 unavailable`                                                                                     |
| POST   | `/api/conversations/current/close` | `{}`                                                                     | `204`                                                                          | `503 unavailable`                                                                                     |
| POST   | `/api/chat`                        | `{ message: { id: string, parts: [{ type: "text", text }] }, trigger? }` | `200` UI message stream (reply, or only `data-conversation-state` when paused) | `400 invalid_input`, `409 message_limit_reached { limit }`, `409 already_answered`, `503 unavailable` |

`/api/auth/*` keep their contracts; only the cookie's content and the 7-day duration change.

**Environment variables**

| App | Variable       | Default (development)                                                   |
| --- | -------------- | ----------------------------------------------------------------------- |
| api | `DATABASE_URL` | `postgres://nexo:nexo@localhost:55432/nexo_api`; required in production |

## Error handling

| Failure                                            | Behavior                                                                                            | Shown to the employee                                                               |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 31st message                                       | `409 message_limit_reached`; nothing saved, agent not called                                        | "Você chegou ao limite de 30 mensagens desta conversa." with "Nova conversa"        |
| Agent fails mid-reply                              | The employee message stays; the partial reply is not saved                                          | The existing error with "Tentar de novo"; the retry does not duplicate the message  |
| Retry after the reply was already saved            | `409 already_answered`                                                                              | The UI reloads the conversation (the reply was saved, for example from another tab) |
| Browser closed mid-reply                           | The server drains the stream and saves the reply                                                    | The reply is there on the next visit                                                |
| Conversation not with the agent                    | Message saved; `data-conversation-state` part; no agent call                                        | Banner "Sua conversa está com a equipe de atendimento"                              |
| Database down                                      | `503 unavailable` on every route that needs it, including the session lookup; logged once           | Support screen error with retry; chat error with retry                              |
| Database not running when the API starts           | The API starts (the pool connects lazily) and answers `503` until it comes back; `/health` stays up | —                                                                                   |
| Cookie with a revoked, expired or old-format seal  | Treated as signed out                                                                               | Redirect to sign-in; in the chat, "Sua sessão expirou."                             |
| Invalid body (no text, other part types, too long) | `400 invalid_input`                                                                                 | Composer keeps the text; generic error                                              |

## Test plan

| What                                                                                                                                                     | Type                 | Why it is worth testing           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | --------------------------------- |
| Migrations apply on PGlite; the partial unique index refuses a second open conversation and allows one after closing                                     | Integration (PGlite) | S-05.1, S-05.4                    |
| First message creates the conversation; history comes back in order with authors and `parts`, including tool parts                                       | Integration          | S-05.3, S-05.5, S-05.7            |
| Chat body with extra `messages`, an `assistant` message or non-text parts: the agent's input and the stored history contain only stored messages         | Integration          | S-05.6                            |
| The reply is saved after the stream ends; a new `createApp` over the same database returns the same conversation and state                               | Integration          | S-05.7, S-05.14                   |
| Agent failing (scripted model that throws): employee message saved once, no reply saved; retry with the same `client_id` saves the reply and counts once | Integration          | S-05.8                            |
| 30 messages pass, the 31st is `409` and the agent is not called; 29 + two sends at once → exactly one passes                                             | Integration          | S-05.9                            |
| Close: state `closed`, the next message starts a new conversation with the counter at 0; close without a conversation is `204`                           | Integration          | S-05.11                           |
| State `waiting_analyst` set in the database: message saved, no agent call, stream has only the state part                                                | Integration          | S-05.12                           |
| Ana's and Bruno's conversations are separate; Bruno's `current` never returns Ana's; analysts get `403` on every conversation route                      | Integration          | S-05.13                           |
| Sessions: sign-in stores a hashed ID; sign-out deletes it and the old cookie gets `401`; an expired row is refused; a cookie without `sid` is refused    | Integration          | S-05.16, S-05.17                  |
| Durations: `Max-Age` of 7 days with "Manter conectado", 10 hours without                                                                                 | Integration          | S-05.18                           |
| Rows ↔ `UIMessage` conversion and the agent history filter (no analyst or system messages)                                                               | Unit                 | The mapping every route relies on |

The existing `auth.test.ts` and `chat.test.ts` move to `createApp({ db: await createTestDb() })`.

**Manual validation of the acceptance criteria**

1. `pnpm db:up`, `pnpm db:migrate`; check the three tables in `nexo_api`.
2. As Ana, send three messages, reload, close the browser, sign in again: the history is there.
3. Restart the API and `docker compose restart postgres`; reload: same history and state.
4. With `curl`, send a body with a made-up history and an assistant message; check the stored history in the database.
5. Send 30 messages (a script with `curl`), then a 31st through `curl` and through the UI; send two at once at 29 against the real PostgreSQL.
6. "Nova conversa": confirm, see the empty chat with 0/30, and the old conversation `closed` in the database.
7. Stop the agent mid-reply (simulated failure) and retry; close the tab mid-reply and come back.
8. Set Ana's conversation to `waiting_analyst` with `psql`, send a message, see the banner and no reply.
9. Sign in as Bruno: empty chat. Sign in as Rafael (analyst): `403` on `/api/conversations/current`.
10. Copy the cookie, sign out, call `/api/auth/me` with the copy: `401`.

## Commit plan

1. `docs(stage-05): approved PRD for conversation persistence` (done)
2. `docs(stage-05): tech spec for conversation persistence` (done)
3. `feat(shared): conversation contracts`
4. `feat(api): database, schema and migrations for conversations and sessions`
5. `feat(api): sign-in sessions stored in the database and revoked on sign-out`
6. `feat(api): conversation repository with the per-conversation message limit`
7. `feat(api): chat route stores the conversation and reads the history from the server`
8. `feat(api): routes to load and close the open conversation`
9. `feat(web): resume the open conversation and start a new one`
10. `docs: conversations and revocable sessions in the README`

Then a pull request "Stage 05 — Conversation persistence" with `Closes #5`.

## Risks

| Risk                                                                                                  | Mitigation                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PGlite runs one connection, so the "two sends at once" test is serialized and does not prove the lock | The conditional `UPDATE` is correct by construction under PostgreSQL's row locks; manual step 5 runs it against the real container                                                          |
| `consumeSseStream` or `onEnd` behave differently with Mastra's stream than with `streamText`          | A test closes the response body mid-stream and checks that the reply is saved; if it fails, the fallback is to consume Mastra's stream on the server and write to the client from that copy |
| A stream with only a transient data part might still create an empty assistant message in `useChat`   | Checked in the browser during implementation; the fallback is a `409 not_with_agent` after saving, with the banner shown from the error code                                                |
| Hono or `@hono/node-server` cancels the stream when the client disconnects before the copy is drained | Same test as above; the copy is read independently of the response body                                                                                                                     |
| Every request now hits the database for the session                                                   | One primary-key lookup; acceptable for the prototype; Stage 11 reviews performance                                                                                                          |
| Existing sessions stop working after deploy (old cookie format)                                       | Expected and harmless: people sign in again once                                                                                                                                            |

## Deviations during implementation

Recorded after the code, before the pull request.

| Deviation                                                                                                                               | Why                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The reply is saved based on the route's own check (the stream reached its end and carried no `error` chunk), not on `onEnd`'s `outcome` | `createUIMessageStream` reports `outcome: "unknown"` unless the stream owner declares one, so "completed" never arrived. The route watches the agent's chunks with a `TransformStream` instead |
| `createApp` takes an optional `runAgent` (defaults to the Mastra agent)                                                                 | Tests need an agent that fails mid-reply, that cannot start, and one whose input can be inspected; the simulated model cannot do the first two                                                 |
| When the agent cannot start, the chat answers `503 unavailable` after saving the message                                                | Not listed in the error table; the UI already shows "Tentar de novo", and the resend is not counted twice                                                                                      |
| States and authors are `text` columns with `check` constraints, not PostgreSQL enums                                                    | Same choice as the ticket service in Stage 4; adding a value later is a one-line migration                                                                                                     |
| Tests share one PGlite database per test file and empty it before each test                                                             | Migrating a fresh database for every test made the API suite take about 25 s; truncating keeps it at about 4 s with the same isolation                                                         |
| `already_answered` in the UI offers "Atualizar conversa", which reloads the page                                                        | `useChat` only reads its initial messages on mount, so reloading is the simplest way to show the reply saved from another tab                                                                  |
| "Nova conversa" redirects to `/` after closing                                                                                          | Without it, React Router left `/?index` in the address bar                                                                                                                                     |
| Analyst and system messages already have their own look (the analyst's name above the bubble; a centered note for the system)           | Small, and it keeps the UI honest if Stage 9 data shows up before its screens; nothing produces those messages yet                                                                             |
| Risk resolved: a stream with only the transient `data-conversation-state` part creates no empty message in `useChat`                    | Checked in the browser with the conversation set to `waiting_analyst`                                                                                                                          |
| Risk resolved: two messages sent at once at 29 against the real PostgreSQL                                                              | One answered `200`, the other `409 message_limit_reached`; the counter and the stored messages ended at 30                                                                                     |
