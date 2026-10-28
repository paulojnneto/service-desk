# Stage 05 — Conversation persistence: PRD

|        |                                                                        |
| ------ | ---------------------------------------------------------------------- |
| Issue  | [#5](https://github.com/paulojnneto/service-desk/issues/5)             |
| Status | Approved (2026-10-28)                                                  |
| Covers | F6, N6 (conversations and their state), M2 (limit), R7, N11 (sessions) |

## Problem

After Stage 4, tickets survive a restart, but conversations do not exist outside the browser:

- **Nothing is saved (N6).** The chat history lives only in the page's memory. Reloading the page, closing the browser or restarting the API loses the whole conversation.
- **No coming back (F6).** The employee cannot close the browser today and continue the same conversation tomorrow.
- **No conversation state (N6, M5).** The challenge requires each conversation's state (with the agent or with an analyst) to survive a restart. There is no place to keep it, so Stage 9 has nothing to pause the agent on.
- **The history comes from the client.** The chat route receives every previous message from the browser and passes them to the agent. A client can send a history that never happened, including replies the agent never gave.
- **The 30-message limit lives only in the UI (M2).** Any client that calls `POST /api/chat` directly can send as many messages as it wants, which also means unbounded model cost (N10).
- **Signing out does not revoke the session (N11).** The sealed cookie from Stage 3 cannot be revoked before it expires: a copy of it keeps working for up to 30 days after signing out (Stage 3 tech spec, risks).

## Goal

At the end of this stage, the API stores every conversation and its messages in PostgreSQL (`nexo_api`), with its state. The server is the only source of the history: the employee closes the browser, comes back another day and continues the same conversation, and the 30-message limit is enforced by the server. Sign-in sessions are stored too, so signing out revokes them.

## Requirements

| ID      | Requirement                                                                                                                                                                                                                   | Source        |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| S-05.1  | The API stores conversations in its own database (`nexo_api`), with versioned migrations applied by the same `pnpm db:migrate` command                                                                                        | N6, N7, N8    |
| S-05.2  | A conversation belongs to one employee and has a state: with the agent, waiting for an analyst, with an analyst, or closed. It records when it was started, last updated and closed                                           | N6, M5, A3    |
| S-05.3  | A conversation stores its messages in order, each with its author (employee, agent, analyst or system), the time it was sent and its full content, including the parts the UI renders (actions, tool results)                 | N6, M7, F6    |
| S-05.4  | An employee has at most one open conversation (any state except closed) at a time                                                                                                                                             | F6            |
| S-05.5  | Opening the support screen loads the employee's open conversation with its full history, in the order it happened; with no open conversation, the empty chat from Stage 3 is shown                                            | F6, N4        |
| S-05.6  | The server is the only source of the history: the client sends only the new message, and the agent receives the history stored on the server. Any history or other author's message sent by the client is ignored             | N11, R7       |
| S-05.7  | Sending a message saves it before the agent is called, and saves the agent's reply when it finishes. A conversation is created on the employee's first message                                                                | N6            |
| S-05.8  | When the agent's reply fails, the employee's message stays saved, the UI keeps the retry action, and retrying produces the reply without saving the employee's message again                                                  | N4, N5        |
| S-05.9  | The server rejects the employee's 31st message in a conversation without calling the agent, with a clear error code; the UI explains the limit. The limit holds even with two messages sent at the same time (two tabs)       | M2, N10       |
| S-05.10 | The counter "N/30 mensagens nesta sessão" shows the count stored on the server, so it survives reloads                                                                                                                        | M2            |
| S-05.11 | The employee can start a new conversation, which closes the current one; the counter starts again at 0 in the new one                                                                                                         | M2, F6        |
| S-05.12 | The chat route only calls the agent when the conversation is with the agent. In any other state, the employee's message is saved and the route answers that the conversation is with the service desk, without an agent reply | M5, R6 (base) |
| S-05.13 | An employee only reaches their own conversations: the conversation is always looked up from the session's person, and asking for any other conversation answers as if it did not exist. Analysts get 403 in this stage        | R7, N11       |
| S-05.14 | Conversations, messages and states survive restarting the API and the database container                                                                                                                                      | N6            |
| S-05.15 | The README explains where conversations are stored, the limit enforced on the server and how to start a new conversation                                                                                                      | N7            |
| S-05.16 | Sign-in sessions are stored in `nexo_api` with the person, the role and the expiry; the cookie holds only a sealed, random session ID, still HTTP-only                                                                        | N11           |
| S-05.17 | Signing out deletes the stored session, so the same cookie is refused from then on; expired sessions are refused and removed                                                                                                  | N11           |
| S-05.18 | "Manter conectado" keeps the session for 7 days instead of 30; without it, the session still lasts 10 hours. This replaces the 30 days in S-03.6                                                                              | N11, M1       |

## Acceptance criteria

- [ ] `pnpm db:migrate` creates the conversation tables in `nexo_api` (and keeps migrating `nexo_tickets`).
- [ ] Ana sends three messages, reloads the page and sees the same history; she closes the browser, signs in again and sees it too.
- [ ] Restarting the API and the database container keeps Ana's conversation, its messages and its state.
- [ ] A request whose body carries previous messages or an agent message not stored on the server does not change the history the agent receives or the history stored.
- [ ] After 30 messages, a 31st sent straight to `POST /api/chat` is rejected with the limit error and the agent is not called; the UI shows the explanation; two messages sent at the same time as the 30th and 31st do not both get through.
- [ ] The counter shows the stored count after a reload.
- [ ] Starting a new conversation closes the previous one and shows the empty chat with the counter at 0.
- [ ] With the agent failing, the employee's message stays in the history; retrying gives the reply and the message appears only once.
- [ ] With a conversation set to "waiting for an analyst" directly in the database, a new message is saved and the agent is not called.
- [ ] Bruno never receives Ana's conversation, by any route or ID; an analyst gets 403 on the conversation routes.
- [ ] After signing out, a request with a copy of the old cookie answers 401.
- [ ] Signing in with "Manter conectado" sets a session that expires in 7 days; without it, in 10 hours.
- [ ] Tests run without Docker, as in Stage 4.
- [ ] Lint, typecheck, tests, build and CI pass.

## Out of scope

- Handoff rules, moving a conversation to an analyst, and the analyst console (Stage 9). This stage only stores the states and keeps the agent from replying outside "with the agent".
- A list of the employee's past (closed) conversations.
- Sample conversations in the seed (Stage 9, for the analyst queue).
- Decision records with intent, confidence and rationale (Stages 6 and 8); this stage stores the message content those stages render.
- Real-time updates between tabs or between employee and analyst (Stage 9).
- Per-user usage limits beyond the 30 messages (Stage 11).

## Dependencies

- Stage 3: the session that identifies the employee and the chat route that takes only `messages` from the client.
- Stage 4: PostgreSQL in Docker with the `nexo_api` database already created, the migration and test setup (PGlite) to reuse.

## Decisions

Resolved on 2026-10-28, all following the recommendation: the 30-message limit counts per conversation; a "Nova conversa" action (with a confirmation, also offered by the limit message) closes the current conversation, with no automatic close by inactivity; the agent is kept from replying outside "with the agent" already in this stage; sign-in sessions are stored in `nexo_api` and revoked on sign-out (S-05.16, S-05.17); "Manter conectado" lasts 7 days (S-05.18).

## Open questions (resolved)

1. **What a "session" is for the 30-message limit.** The product PRD counts the employee's messages "per chat session". _(Recommended: per conversation. A new conversation starts the count again; signing out and in does not, otherwise the limit would be one click away.)_
2. **How a conversation closes in this stage.** Analysts close conversations from Stage 9, so today nothing would ever close one, and an employee at the limit would be stuck. _(Recommended: a "Nova conversa" action in the chat header, with a confirmation, which closes the current conversation; the limit message offers the same action. No automatic close by inactivity, so "coming back another day" (F6) always works.)_
3. **Agent paused outside "with the agent".** The pause is Stage 9's, but the state arrives now. _(Recommended: enforce it already (S-05.12): it is a small check in the route, it makes the state mean something from the start, and Stage 9 only adds the transitions and the UI.)_
4. **Sign-in sessions stored in the database.** Today the sealed cookie cannot be revoked before it expires: signing out clears it in the browser, but a copy of the cookie keeps working for up to 30 days (Stage 3 tech spec, risks). With `nexo_api` available, sessions can live in a table, the cookie keeps only a sealed random session ID, and signing out deletes the row, so the copy stops working at once. _(Recommended: yes, in this stage; it is a small table and closes the documented trade-off. Adds S-05.16 and S-05.17 and one acceptance criterion.)_
5. **"Manter conectado" duration.** 30 days was approved in Stage 3 (S-03.6). _(Recommended: shorten it to 7 days, which is a work week plus the weekend and matches the reopening window; keep 10 hours without it. This changes S-03.6 (S-05.18), noted in the Stage 3 PRD as a later decision.)_
