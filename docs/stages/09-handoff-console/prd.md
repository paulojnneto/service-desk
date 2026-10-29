# Stage 09 — Handoff and analyst console: PRD

|        |                                                            |
| ------ | ---------------------------------------------------------- |
| Issue  | [#9](https://github.com/paulojnneto/service-desk/issues/9) |
| Status | Approved on 2026-10-29                                     |
| Covers | M5, M6, A1–A3, F5, R6, R7                                  |

## Problem

Since Stage 6 the agent can hand a conversation to an analyst, and since Stage 5 it stays quiet while the conversation waits. But no one is on the other side:

- **The analyst has nowhere to go.** Signing in as Rafael shows a "console em construção" page. Screens 4 and 5 (list, history, take over, reply, hand back, close, the employee's tickets) do not exist.
- **The summary is lost.** The agent writes a summary for the analyst, but it only reaches the ticket's transfer event, and only when there is a related ticket. The API keeps no record of who handed off, why, when or about what.
- **The conversation never comes back.** "Waiting for an analyst" has no exit: nothing takes it over, nobody replies, and the employee stays stuck until they start a new conversation.
- **The employee cannot see a person.** The chat would show an analyst's message only after a reload, and nothing tells the employee that someone took over.
- **Low confidence is invisible to the service desk (A2).** Stage 8 shows the confidence of each reply, but only inside the conversation. An analyst cannot find the conversations where the agent was unsure.
- **The agent forgets what the analyst did.** Its history leaves out analyst and system messages (Stage 5), so after a hand back it would answer as if nothing had happened.
- **A known flaw.** With GPT-5.5, the agent handed off once without a clear "yes" from the employee (Stage 6 finding, left to this stage).

## Goal

At the end of this stage, a conversation that needs a person reaches the analyst with a summary, and the analyst can take it over, reply, hand it back to the agent or close it, from a console that follows Screens 4 and 5. The employee sees who is answering, in near real time. The agent stays quiet on the server while a person has the conversation, and knows what happened when it gets it back.

## Requirements

| ID      | Requirement                                                                                                                                                                                                                                                                                                        | Source     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| S-09.1  | **Handoff record:** every handoff stores, with the conversation, its reason (the employee asked, a critical case, an overdue ticket, low confidence), the agent's summary, the related ticket when there is one, and the time. A system note in the conversation says it was handed off                            | R6, A1, F5 |
| S-09.2  | **When to hand off:** the agent hands off without asking only when the employee asked for a person in words or the case is critical. For an overdue ticket or low confidence, it first offers an analyst with options and hands off only after the employee picks it                                               | R6, F5     |
| S-09.3  | **Conversation list (Screen 4):** the analyst sees the employees' conversations with the person, the last message, the time, and a status ("Transferida · INC-20311", "Agente pediu ajuda · confiança baixa", "Agente atendendo", "Você está atendendo", "Encerrada"), newest activity first, waiting ones on top  | M6, A2     |
| S-09.4  | **Filters:** "Para você" (waiting for an analyst, plus conversations with the agent whose last decision had low confidence), "Com o agente", "Minhas" (taken by the signed-in analyst) and "Todas", each with its count, plus a search by the person's name or a ticket number                                     | M6, A2     |
| S-09.5  | **History:** opening a conversation shows every message in order, with the author: the employee, Nexo Assist with its decision detail (Stage 8), analysts with their name and level, and the system notes. The handoff summary, reason and related ticket stand at the top of a waiting conversation               | M6, A1, M7 |
| S-09.6  | **The employee's tickets (Screen 4 panel):** the related ticket ("Desta conversa") with its status, priority and deadline, then the employee's other tickets, read from the ticket service for that employee only and only through an analyst route                                                                | M6, R7     |
| S-09.7  | **Take over (Screen 5):** an analyst takes over a waiting conversation, or one still with the agent. The conversation becomes "with an analyst", assigned to them; the agent stays paused. Only one analyst can hold it: a second attempt is refused                                                               | M5, A3     |
| S-09.8  | **Reply:** only the analyst who holds the conversation can reply. The reply is stored as the analyst's message and does not count toward the employee's 30-message limit                                                                                                                                           | A3, F5     |
| S-09.9  | **Hand back and close:** the analyst who holds it, or any analyst while it waits, can hand it back to the agent ("with the agent" again) or close it. Each action leaves a system note. A closed conversation cannot receive messages; the employee's next message starts a new one                                | A3, M5     |
| S-09.10 | **The agent is paused on the server:** while waiting for or with an analyst, the chat route saves the employee's message and never runs the agent, whatever the client sends; after a hand back, it answers again                                                                                                  | M5, R6     |
| S-09.11 | **The agent knows what happened:** after a hand back, the agent's history includes the analyst's messages and the system notes as context, so it does not repeat what the analyst said or ask again what was answered                                                                                              | A3, M3     |
| S-09.12 | **The employee sees the person:** the chat shows the analyst's messages with their name and level, and the notes "Rafael Lima assumiu o atendimento", "Conversa devolvida ao Nexo Assist" and "Atendimento encerrado". New messages and state changes appear within a few seconds, without a reload, on both sides | F5, M2     |
| S-09.13 | **States:** the employee's banner and composer follow the state (waiting, with an analyst, back with the agent, closed); the console shows the actions each state allows, with loading and error states, and refreshes a conversation that another analyst changed                                                 | N4, M6     |
| S-09.14 | **Roles and privacy:** every console route requires the analyst role; employees never reach another conversation; the ticket panel only reads the conversation's employee                                                                                                                                          | R7, N11    |
| S-09.15 | **Sample conversations:** a development seed creates a few conversations from the sample employees in different states (waiting with a summary, with the agent at low confidence, with an analyst, closed), so the console can be tried without playing every role                                                 | N7, M6     |
| S-09.16 | **Simulated mode:** the scripted model follows the new handoff rule (offering first for an overdue ticket) and reads the analyst's messages after a hand back, so the flows are tested without a key                                                                                                               | N7, N9     |
| S-09.17 | The README explains the handoff, the console, and how to try both sides (two browsers or two profiles)                                                                                                                                                                                                             | N7, N8     |

## Acceptance criteria

- [ ] As Ana, "Quero falar com um analista" hands off with a summary: the chat shows that the service desk has it, and the next message gets no agent reply, even when sent straight to the API.
- [ ] After the INC-20311 card, the agent offers an analyst with options and hands off only after "Falar com um analista"; the handoff stores the reason "chamado vencido" and the ticket.
- [ ] As Rafael, the conversation is on top of "Para você" with the summary, the reason and INC-20311 in the panel, plus Ana's other tickets.
- [ ] A conversation with the agent whose last reply had low confidence appears in "Para você" with "confiança baixa".
- [ ] Rafael takes over; Ana's chat shows "Rafael Lima assumiu o atendimento" without a reload. Rafael replies; Ana sees the message, and Ana's answer reaches Rafael, both within a few seconds.
- [ ] A second analyst cannot take over or reply to a conversation Rafael holds.
- [ ] Rafael hands back: the agent answers Ana's next message and does not ask again what Rafael already settled. Rafael closes another: Ana's next message starts a new conversation.
- [ ] An employee gets 403 on every console route; the ticket panel shows only the conversation's employee's tickets.
- [ ] The seed fills the console with conversations in each state.
- [ ] All the above pass in automated tests with the simulated model; the handoff rule and the hand back were run manually with a real model (after asking, since it costs).
- [ ] Lint, typecheck, tests, build and CI pass.

## Out of scope

- Notifications (sound, browser, email) and analyst availability: the "Disponível" badge is shown, not managed.
- Routing by level (N1, N2) or queues; any analyst sees every conversation.
- Changing the ticket's status from the console, or creating tickets as the analyst. The panel reads tickets; writes stay with the employee's confirmed drafts.
- Response-time targets for handoffs ("contato em 25 min"): the list shows how long a conversation has waited.
- Measuring handoff quality with scenarios (Stage 10).
- The console at phone width: it targets desktop and tablet.

## Dependencies

- Stage 5: conversation states, the quiet agent while waiting, the message authors.
- Stage 6: the `transferirParaAnalista` tool and the handoff service.
- Stage 7: the cards and the options, reused by the employee chat and by the history in the console.
- Stage 8: the decision record, `DecisionDetail` and the analyst route `GET /api/analyst/conversations/:id`.
- Stage 3: the analyst role and the analyst landing page, which becomes the console.
- Stage 4: the ticket service and `@nexo/tickets-client`.
- The prototype (`docs/prototype/04-console-conversas.png`, `05-console-assumido.png`, `nexo.pen`) as the visual reference.

## Decisions

Resolved on 2026-10-29, all following the recommendation: both sides poll a "what changed since" route every 3 seconds while the page is visible; handoffs live in a `handoffs` table, and the conversation stores who holds it and since when; any analyst takes over, only the holder replies, the holder (or any analyst while it waits) hands back or closes, and taking over is a conditional update; a conversation still with the agent can be taken over; the agent hands off directly only on an explicit request or a critical case, and offers first otherwise, with no check in code; after a hand back the agent reads the analyst's messages and the system notes as context lines; an analyst-only route reads the conversation's employee's tickets as that employee; "Para você" holds waiting conversations and those with the agent at low confidence; a development seed adds sample conversations; the employee's composer stays enabled; the console targets desktop and tablet; the employee sees the analyst's name and level.

## Open questions (resolved)

1. **How both sides see new messages.** Options: polling, server-sent events, or WebSockets. _(Recommended: polling a small "what changed since" route every 3 seconds while the page is visible, on the employee's chat when the conversation is not with the agent, and on the console. It works with the existing stack and any proxy, survives restarts, and 3 seconds is enough for a support chat. SSE or WebSockets need a hub that knows every open connection, which a later stage can add if the load asks for it.)_
2. **Where the handoff record lives.** _(Recommended: a `handoffs` table in `nexo_api`, one row per handoff (conversation, reason, summary, ticket, time), and two columns on the conversation for who holds it and since when. The ticket's transfer event stays as it is. A conversation can be handed off, handed back and handed off again, and each time keeps its own summary.)_
3. **Which analyst may act.** _(Recommended: any analyst can take over a waiting conversation or one with the agent; only the holder can reply; hand back and close are allowed to the holder, or to any analyst while it waits. Taking over is a conditional update, so two clicks at once give one winner and a clear "Rafael Lima já assumiu" to the other. A "take from a colleague" action is left out.)_
4. **Taking over a conversation still with the agent.** A2 asks for the conversations where the agent was not confident, which may not have been handed off. _(Recommended: allowed. The agent stops at once, as with a handoff, and the employee sees the note. It lets the service desk step in before the employee gives up. Without it, "confiança baixa" in the list would be something the analyst can only watch.)_
5. **The handoff without a clear "yes".** _(Recommended: the agent hands off directly only when the employee asked for a person in words, or for a critical case; for an overdue ticket or low confidence it offers with `perguntar` first. This goes in the instructions, the tool description and the scripted model, and the reason is stored and shown. A check in code is not proposed: telling an explicit request from an implicit one is a judgment, and a mistaken handoff costs one click on "Devolver ao agente". Stage 10 measures it.)_
6. **How the agent reads the analyst's messages after a hand back.** _(Recommended: the history it reads keeps the employee's and its own messages as they are, and adds the analyst's messages and the system notes as short context lines ("Analista Rafael Lima: …", "Nota: conversa devolvida ao Nexo Assist"). The agent knows what the person said, but cannot mistake it for its own words. It does not see conversations from before a "Nova conversa".)_
7. **How the ticket panel reads another person's tickets.** The ticket service answers as the requester in the signed token (R7). _(Recommended: an analyst-only API route that reads the tickets as the conversation's employee, using the same client and token, and only for a conversation that exists. The ticket service stays unchanged, the employee can only ever be the one in the conversation, and the token never reaches the browser. Giving the ticket service an analyst role would be cleaner long-term, but changes a separate service for a read-only panel.)_
8. **What "Para você" contains.** _(Recommended: conversations waiting for an analyst, plus open conversations with the agent whose latest decision had low confidence. "Minhas" holds what the signed-in analyst holds. Closed conversations appear only in "Todas", for a few days.)_
9. **Sample data for the console.** With only Ana, the console has one conversation. _(Recommended: a development seed (`pnpm db:seed`, which already resets the tickets) that also writes four or five conversations from Bruno, Carla, Diego and others, in the states of Screen 4, with stored decision records. It never runs in production, and Ana's own conversation is left untouched.)_
10. **The employee's composer while waiting or with an analyst.** _(Recommended: it stays enabled. Messages are stored and shown to the analyst, as the prototype shows "Está parado há 5 dias" sent while waiting. The banner says who has the conversation. They still count toward the 30-message limit, which protects the service desk too.)_
11. **The console at narrow widths.** The prototype is desktop only. _(Recommended: desktop and tablet (from 768 px): the ticket panel collapses into a button below 1280 px and the list and the history become two views below 1024 px. The analyst works at a desk; phone width is out of scope.)_
12. **The analyst's identity in the employee chat.** _(Recommended: the analyst's name and level, as in Screen 5 ("Rafael Lima · Suporte N2"), with their initials. The employee knows a person is answering and who, which is the point of F5. No photo or contact details.)_
