# Stage 07 — Chat cards and flows: PRD

|        |                                                            |
| ------ | ---------------------------------------------------------- |
| Issue  | [#7](https://github.com/paulojnneto/service-desk/issues/7) |
| Status | Approved on 2026-10-28                                     |
| Covers | M2, N4, F2, F4                                             |

## Problem

After Stage 6, the agent follows the service desk rules, but the chat still shows almost everything as plain text:

- **Tickets are text.** When the agent looks up a ticket, the status, priority, deadline and overdue warning are buried in a sentence. Screen 3 shows them in a ticket card.
- **Choosing a ticket means typing.** With several open tickets, the agent asks "Sobre qual deles quer saber?" and the employee has to type the number. Screen 3 shows a ticket picker.
- **Questions have no options.** "Quem está sendo afetado?" lists the answers in the sentence. Screen 2 shows them as quick-reply options, and so does the offer of an analyst in Screen 3.
- **The draft is a placeholder.** Stage 6 gave the draft a minimal block with Confirmar and Cancelar. Screen 2 shows a card with a status, the fields, Confirm (with a keyboard shortcut), Edit and Cancel. There is no way to fix a field without asking the agent again.
- **Few states.** The interface is evaluated on loading and error states (N4). Today a draft whose confirmation failed, a ticket the service could not return and a draft from an earlier session all look the same.

## Goal

At the end of this stage, Screens 2 and 3 are reproduced and work: ticket cards, a ticket picker, questions with quick-reply options and a draft card with Confirm, Edit and Cancel. Each card has loading and error states, and picking a ticket or an option is sent as the employee's message. The flows work with the simulated model and with a real one.

## Requirements

| ID      | Requirement                                                                                                                                                                                                                                                                                                                                                                                             | Source         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| S-07.1  | **Ticket card (Screen 3):** when the agent reads one of the employee's tickets, the reply shows a card with the type label and number, the status, the title, the description, the category, the priority, when it was opened and when it was last updated. An overdue ticket shows "prazo vencido" next to the last update.                                                                            | M2, F2, R9     |
| S-07.2  | **Ticket picker (Screen 3):** when the agent asks which ticket the employee means, the reply shows the open tickets as a single-choice list with the number, title, status and opening date. Picking one sends "NÚMERO · título" as the employee's message.                                                                                                                                             | M2, F2         |
| S-07.3  | **Quick-reply options (Screens 2 and 3):** when the agent asks a question with a few known answers (who is affected, how urgent, whether to call an analyst), the reply shows the question and the options as buttons. Picking one sends its text as the employee's message, and typing a free answer still works.                                                                                      | M2             |
| S-07.4  | A question or picker can be answered only while it is the last agent reply. Once answered, its options are disabled and the chosen one stays highlighted, also after reloading the page.                                                                                                                                                                                                                | M2, F6         |
| S-07.5  | **Draft card (Screen 2):** the draft shows its kind and number ("Novo chamado · Rascunho D-381"), a status ("Aguardando confirmação"), the title, the description, the category, the priority with the response deadline, who is affected, and the open tickets of the same category when there are any. Update and reopening drafts show the ticket and the message or reason.                         | M2, R3, R4, R9 |
| S-07.6  | **Confirm, Edit and Cancel:** Confirm and Cancel call the Stage 6 routes. Edit opens the draft's fields in place. Saving checks the fields on the server, recalculates the priority and the deadline from who is affected and the urgency, and keeps the same draft.                                                                                                                                    | M2, R3, R9     |
| S-07.7  | **Draft states:** the card shows waiting for confirmation, confirming, created, updated or reopened (with the ticket number), cancelled, and an error that keeps the draft when the ticket service is down, with a retry. A draft that was replaced or whose conversation closed cannot be confirmed. Reloading the page shows each draft in its current state, not the state at the time of the reply. | M2, N4, N5     |
| S-07.8  | **Loading and error states:** while a tool runs, its card shows a placeholder with the card's shape. When a tool fails (ticket service down, ticket not found), the card is replaced by a short message saying what could not be done, with no empty card.                                                                                                                                              | N4             |
| S-07.9  | **Keyboard:** Ctrl+Enter (⌘+Enter on macOS) confirms the waiting draft, shown on the button as in the prototype. With the composer empty, the number keys pick the options of the waiting question in order. The picker and the options can be reached with Tab and the arrow keys.                                                                                                                     | M2, N4         |
| S-07.10 | **Action line:** the labels above each reply follow the prototype and name what was looked at: "consultou o INC-20311", "calculou o prazo", "classificou a prioridade", "montou o rascunho". A label never claims an action that did not run.                                                                                                                                                           | M2, M7         |
| S-07.11 | **The agent decides what to show:** questions with options and the ticket picker come from a tool the agent calls, not from parsing its text. The ticket picker only lists the employee's own open tickets, checked on the server.                                                                                                                                                                      | M3, R7         |
| S-07.12 | **Simulated mode:** the scripted model follows Screens 2 and 3 with the new cards (options for who is affected, the picker, the INC-20311 card with the offer of an analyst), so the flows work and are tested without a key.                                                                                                                                                                           | N7, N9         |
| S-07.13 | **Real model:** the agent's instructions tell it when to ask with options and when to show the picker; the flows are run manually with a real model.                                                                                                                                                                                                                                                    | N3, M3         |
| S-07.14 | **Narrow screens:** cards, the picker and the options keep working at phone width; the card fields wrap instead of overflowing.                                                                                                                                                                                                                                                                         | N4, section 8  |

## Acceptance criteria

- [ ] Screen 2 works in the UI, as Ana: "Meu notebook não conecta na VPN desde ontem. Aparece o erro 809." → the operating system → the "Quem está sendo afetado?" options → the urgency → a draft card with Alta priority and its deadline. Confirm (button or Ctrl+Enter) creates the ticket, and the card shows "Criado · INC-20312".
- [ ] Screen 3 works in the UI: "Qual o status do meu chamado?" shows the picker with Ana's open tickets. Picking INC-20311 sends "INC-20311 · Notebook lento após atualização do Windows" as her message, and the reply shows the INC-20311 card with "prazo vencido", followed by the options "Falar com um analista", "Adicionar informação" and "Não, obrigado".
- [ ] Picking a ticket or an option is sent as the employee's message and stored in the history. After reloading the page, the options are disabled with the chosen one highlighted.
- [ ] Edit changes a draft's fields. Changing who is affected or the urgency changes the priority and the deadline, which are recalculated on the server. Invalid values are refused, and nothing is created until Confirm.
- [ ] Every card has loading and error states: a placeholder while the tool runs; with the ticket service stopped, a message instead of the ticket card, and a confirm error that keeps the draft and can be retried.
- [ ] A draft from an earlier reply shows its current state after a reload (created, cancelled or replaced) and cannot be confirmed again.
- [ ] Number keys answer the waiting question when the composer is empty, and the cards can be used with the keyboard only.
- [ ] Cards, picker and options work at 375 px wide.
- [ ] All the above pass in automated tests with the simulated model; the flows were run manually with a real model.
- [ ] Lint, typecheck, tests, build and CI pass.

## Out of scope

- The decision detail (what the agent understood, confidence, rationale) in the UI (Stage 8). The action line is the only transparency change here.
- The analyst console and the analyst's messages (Stage 9).
- Showing a ticket's full history in the card. The card shows the last update; the history stays with the agent and the analyst.
- New agent rules. Stage 7 changes how answers appear; the rules stay those of Stage 6.

## Dependencies

- Stage 6: the tools, the drafts with their confirm and cancel routes, and the scripted flows.
- Stage 5: the stored history, which keeps the employee's picks and the card states after a reload.
- The prototype (`docs/prototype/02-chat-novo-chamado.png`, `03-chat-consulta.png` and `nexo.pen`) as the visual reference.

## Decisions

Resolved on 2026-10-28, all following the recommendation: questions with options and the ticket picker come from a `perguntar` tool that writes nothing; the picker gets only ticket numbers and the server keeps the employee's open tickets; a ticket card shows the ticket as it was when the agent read it, with that time; Edit is a form in the card, validated on the server, which recalculates priority and deadline and leaves a note for the agent outside the message limit; title, description, type, category, who is affected and urgency are editable for a new ticket, the message for an update and the reason for a reopening; Ctrl+Enter or ⌘+Enter confirms, number keys pick an option only with the composer empty, Esc closes the edit form; the conversation route returns each draft's current state.

## Open questions (resolved)

1. **How the agent asks a question with options.** The options could be parsed from the reply text, or the agent could ask through a tool. _(Recommended: a tool, `perguntar`, with the question and two to five options, or with ticket numbers for the picker. It writes nothing. The UI renders the question and its options from the tool's output. It is structured, works the same with the simulated and the real model, shows in the action line, and the employee's answer stays a normal message.)_
2. **Where the picker's data comes from.** _(Recommended: the agent passes only ticket numbers. The tool looks them up as the employee and keeps only their open tickets, so the model cannot put another person's ticket or invented data in the picker (R7).)_
3. **What a ticket card shows after a reload.** It can show the ticket as it was when the agent read it, or fetch it again. _(Recommended: as it was, with the time it was read. The card is part of what the agent said at that moment, and loading the history does not call the legacy service once per card. A fresh look is one message away.)_
4. **How Edit works.** "Editar" could send "quero mudar o rascunho" to the agent, or open a form. _(Recommended: a form in the card. Edit changes fields the employee already sees, without a model call and with predictable results. The server validates the fields and recalculates priority and deadline with the same rule as Stage 6, and a note in the conversation ("Você editou o rascunho D-381") lets the agent see the change on the next turn. The note does not count toward the 30-message limit.)_
5. **Which fields can be edited.** _(Recommended: for a new ticket, the title, the description, the type, the category, who is affected and the urgency, but not the priority, which comes from the last two (R9). For an update, the message. For a reopening, the reason.)_
6. **Keyboard shortcuts.** _(Recommended: Ctrl+Enter or ⌘+Enter confirms the waiting draft, from anywhere in the chat, as the prototype shows on the button. Number keys pick an option only when the composer is empty, so typing a number in a message still works. Esc closes the edit form without saving.)_
7. **States of older drafts.** _(Recommended: the conversation route returns each draft's current status and resulting ticket, and the card shows those, so a reload never offers Confirm on a draft that was already created, cancelled or replaced.)_
