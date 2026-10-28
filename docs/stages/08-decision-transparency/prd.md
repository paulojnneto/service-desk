# Stage 08 — Decision transparency: PRD

|        |                                                            |
| ------ | ---------------------------------------------------------- |
| Issue  | [#8](https://github.com/paulojnneto/service-desk/issues/8) |
| Status | Approved on 2026-10-28                                     |
| Covers | M7, A2 (the record the analyst reads), R7, N4              |

## Problem

Transparency is "the most important part of the challenge" (M7). After Stage 7, the agent already produces a decision record for every reply, but almost none of it reaches a person:

- **The record is invisible.** Intent, confidence, rationale and the Annex A rules live in the `decisions` table and in `metadata.decision` of `GET /api/conversations/current`. Nothing in the UI shows them; a reviewer has to open the network tab or the database to learn why the agent did something.
- **The action line tells half the story.** Stage 7's labels ("consultou o INC-20311", "montou o rascunho") say what ran, not what the agent understood, how sure it was or why it chose that path. A reply with no tools (an out-of-scope redirect, a clarifying question) and the replies the server writes after Confirm or Cancel have an empty line.
- **A live reply has no record.** The record is built and stored when the reply ends, but it is not sent in the stream. It only appears after a reload, so the reply the employee is reading cannot be explained.
- **The record speaks in codes.** `status_chamado`, `preparou_rascunho`, `R5`, `prepararReabertura`, `nao_encontrado` are meaningful to us, not to an employee or an analyst.
- **The rationale has no rules of its own.** The model writes it freely. Nothing says who it is written for, and nothing prevents it from revealing what the reply must not, such as the owner of someone else's ticket (R7).
- **The record can be honest and still misleading.** Runs with GPT-5.5 refused an old reopening without calling `prepararReabertura`, so the record says `consultou_chamados` while the text says "não posso reabrir". The rules list is only what the model claims; a rule enforced by code (R3 on a draft, R9 on the priority) is missing whenever the model forgets to cite it.
- **The analyst has nothing yet.** Stage 9 builds the console, and it needs the same record, in the same words, to triage the conversations where the agent was not confident (A2).

## Goal

At the end of this stage, every agent reply in the chat can be explained from the UI in a few seconds: the action line says what ran, and an expandable detail says what the agent understood, what it did, how confident it was and why, with the tools and the rules, in plain Portuguese. The detail is the same for the employee and the analyst, it is there while the reply is still on screen and after a reload, and it never claims or reveals more than the reply itself.

## Requirements

| ID      | Requirement                                                                                                                                                                                                                                                                                                                                                          | Source        |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| S-08.1  | **Detail on every reply:** each agent reply has a control next to its action line that expands a detail with five parts, in this order: what the agent understood (intent), what it did (action), how confident it was (confidence), why (rationale), and how (the tools that ran, with their outcome, and the Annex A rules applied). It is collapsed by default.   | M7            |
| S-08.2  | **Plain language:** intent, action, confidence, tool, outcome and rule are shown as short Portuguese phrases from one catalog in `@nexo/shared`, never as codes ("Quer saber o status de um chamado", "Montou um rascunho para você confirmar", "R5 · Reabertura em até 7 dias"). The same catalog serves the employee chat and the analyst console.                 | M7            |
| S-08.3  | **Confidence at a glance:** confidence is shown as a level (alta, média, baixa) with a word and a color, never color alone, plus one sentence on what the level means. When it is média or baixa, the collapsed control already shows it, so a doubtful decision stands out without opening anything.                                                                | M7, R6, A2    |
| S-08.4  | **Live and after a reload, the same record:** the record of a reply reaches the browser when the reply ends, without a reload, and it is the same record that is stored and returned later by the conversation route.                                                                                                                                                | M7, N4        |
| S-08.5  | **Tools with what they touched:** each tool in the detail shows its plain name, its main argument when it has one (the ticket number, the help center search term) and its outcome ("ok", "não encontrado", "sistema de chamados fora do ar", "recusado", "erro"). No raw JSON is shown.                                                                             | M7, M3        |
| S-08.6  | **Rules that code enforced are always listed:** the record's rules are the ones the model cited plus the ones the tools that ran enforce (for example R3 for any draft, R9 for a creation draft, R5 for a reopening, R7 for a ticket lookup). The detail tells the two apart, so a reader sees which rules were checked by code and which were the model's judgment. | M7, S-06.14   |
| S-08.7  | **Replies written by the server:** the replies after Confirm or Cancel, which no model wrote, show the same detail, marked as decided by the system with the employee's confirmation. Their action line shows what the server did ("criou o INC-20312").                                                                                                             | M7, R3        |
| S-08.8  | **Missing or incomplete records are shown as such:** a reply whose model did not call `registrarDecisao` shows "O agente não registrou a decisão" with low confidence, and a reply with no record (from before Stage 6) shows that there is no record. Nothing is invented to fill the gap.                                                                          | M7, S-06.14   |
| S-08.9  | **The detail never says more than the reply may (R7):** the rationale and the tools never reveal another person's ticket, its owner or its existence; a request for someone else's ticket reads, in the detail too, the same as a ticket that does not exist. The rationale is rendered as plain text, so a message cannot inject markup through it.                 | R7, N11       |
| S-08.10 | **A rationale people can read:** the instructions ask for one or two sentences in Portuguese, written for both the employee and the analyst, saying what was asked and why this path was chosen, with no tool names, codes or instructions. The scripted model's rationales follow the same rule.                                                                    | M7, S-06.18   |
| S-08.11 | **The record matches the conversation:** a refused reopening is recorded as `recusou_reabertura` because the agent always checks the window through `prepararReabertura`, never by reading the dates itself; a reply that asks a question with options (`perguntar`) is recorded as asking, not as a plain answer.                                                   | R5, M7        |
| S-08.12 | **Ready for the analyst:** the detail is one component that takes a decision record and does not depend on the employee chat. An analyst-only route returns any conversation's messages with their records, in the same shape as the employee's route, so the Stage 9 console only has to place it.                                                                  | A2, M6, M7    |
| S-08.13 | **Usable everywhere:** the control works with the keyboard and announces whether it is open; the detail fits at 375 px wide; opening one reply's detail does not move the composer or close the cards.                                                                                                                                                               | N4, section 8 |
| S-08.14 | **Simulated mode:** every scripted flow (VPN error 809, ticket status with INC-20311, adding information, reopening INC-20150, refusing INC-19877, out of scope, someone else's ticket, asking for an analyst) produces a complete record with a readable rationale, so the detail can be seen and tested without a key.                                             | N7, N9        |
| S-08.15 | The README explains how to read the detail of a reply and what each part means, in "How the agent decides".                                                                                                                                                                                                                                                          | N7, N8        |

## Acceptance criteria

- [ ] As Ana, in simulated mode, every agent reply of the Screen 2 and Screen 3 flows has a detail that opens and closes, with intent, action, confidence, rationale, tools and rules in Portuguese, and no codes or JSON.
- [ ] The detail appears right after the reply ends, without a reload; after a reload it is identical.
- [ ] The VPN draft reply lists R3 and R9 as enforced by code, even when the model's own list omits them.
- [ ] A reply with confidence média or baixa shows its level on the collapsed control.
- [ ] After "Confirmar", the server's reply has a detail marked as decided by the system and an action line with the created ticket's number.
- [ ] Refusing INC-19877 is recorded as `recusou_reabertura`, with R5 enforced by code; the detail says why it cannot be reopened.
- [ ] "Mostre o chamado REQ-10439" as Ana: neither the reply nor its detail mentions Carla or that the ticket exists; the tool's outcome reads "não encontrado".
- [ ] A reply stored without `registrarDecisao` shows "O agente não registrou a decisão" with low confidence; a message from before Stage 6 shows that there is no record.
- [ ] As an analyst, the analyst route returns a conversation's messages with the same records; as an employee, the route is refused.
- [ ] The detail can be opened and read with the keyboard only and fits at 375 px wide.
- [ ] All the above pass in automated tests with the simulated model; the Screen 2 and 3 flows, the reopening refusal and the handoff were run manually with a real model (after asking, since it costs).
- [ ] Lint, typecheck, tests, build and CI pass.

## Out of scope

- The analyst console, its conversation list, filters, take over, hand back and close (Stage 9). This stage gives it the record, the route and the component.
- Measuring how often the decisions are right with a scenario set (Stage 10).
- Confidence as a percentage. Stage 6 decided three levels; the "confiança 41%" in Screen 4 becomes "confiança baixa".
- Editing, rating or disputing a decision from the UI.
- Showing the model's full prompt, raw tool inputs and outputs, tokens or costs (Stage 11 measures costs).
- New service desk rules. The only agent changes are the rationale's wording and the reopening check (S-08.10, S-08.11).

## Dependencies

- Stage 6: the decision record, `buildDecisionRecord`, the `decisions` table and the server-written decisions in `apps/api/src/drafts/confirm.ts`.
- Stage 7: the action line (`actionLabels` in `apps/web/src/components/chat/parts.ts`), the cards and the scripted flows of Screens 2 and 3.
- Stage 3: the analyst role in the session, used by the analyst route.
- An `OPENAI_API_KEY` in `apps/api/.env.local` for the manual run with GPT-5.5, used only after asking.

## Decisions

Resolved on 2026-10-28, all following the recommendation: the detail opens inline under the action line from a "Por quê?" control, collapsed by default; the chat route sends the stored record as the reply's message metadata when the stream ends; confidence is a level with a word, a color and a fixed sentence, and only média and baixa show on the collapsed control; the labels come from a typed catalog in `@nexo/shared`; `buildDecisionRecord` adds the rules enforced by the tools that ran, kept apart from the rules the model cited; the record stores one short, safe argument per tool; the refused reopening is fixed here by always going through `prepararReabertura`; the handoff without a clear "yes" is left to Stage 9; a `perguntou` action is added below `pediu_esclarecimento`; the analyst gets the standalone component and an analyst-only route, with no screen until Stage 9; the rationale is one neutral, third-person text for both readers.

## Open questions (resolved)

1. **Where the detail lives.** It could open inline under the reply, in a side panel, or in a tooltip. _(Recommended: inline, under the action line, collapsed by default, opened by a "Por quê?" control at the end of the line. It stays next to the reply it explains, works at phone width, and a tooltip cannot hold five parts or be read with the keyboard. Whether it is open is not stored; a reload closes it.)_
2. **How the record reaches a live reply.** _(Recommended: the chat route builds the record when the stream ends, with the same `buildDecisionRecord` it already stores, and sends it as the reply's message metadata before closing the stream. The UI reads `metadata.decision` in both cases, so live and reloaded replies cannot differ. Building it in the browser from the parts would duplicate the rules and could disagree with the stored record.)_
3. **How confidence is shown.** Screen 4 shows "confiança 41%"; Stage 6 chose three levels. _(Recommended: the level as a word with a color dot, "Confiança alta / média / baixa", and one fixed sentence per level: alta, "entendeu o pedido e tinha o que precisava"; média, "entendeu, mas com alguma suposição"; baixa, "não tem certeza do que você precisa". On the collapsed control only média and baixa appear, so most replies stay quiet.)_
4. **Who writes the plain-language labels.** _(Recommended: a catalog in `@nexo/shared` that maps every intent, action, outcome, tool and rule to its Portuguese phrase, typed against the zod enums so a new value fails the typecheck until it has a label. The model writes only the rationale; everything else is fixed text, predictable and tested.)_
5. **Rules cited vs rules enforced.** Today the rules are only what the model claims. _(Recommended: `buildDecisionRecord` adds the rules the tools that ran enforce, from a fixed table (drafts → R3; creation draft → R4 and R9; reopening → R5; ticket lookups → R7; handoff → R6; out-of-scope intent → R8), and the record keeps both lists apart. The detail shows "garantidas pelo sistema" and "aplicadas pelo agente". Merging them silently would hide which rule is a guarantee and which is a judgment.)_
6. **Main argument of each tool.** The stored record has only the tool name and outcome. _(Recommended: store one short, safe argument per tool in the record (the ticket number, the search term, the draft kind), chosen by code per tool, never the raw input. The analyst reads the record without the message parts, and nothing sensitive or long enters the table.)_
7. **The refused reopening found with GPT-5.5.** _(Recommended: fix it here, because it makes the record wrong, which is what this stage shows. The instructions say that any reopening request goes through `prepararReabertura`, which checks the window in code, and the tool's description says the same. A unit test covers the record of a refusal, and the manual run with GPT-5.5 confirms it.)_
8. **The handoff without a clear "yes", also found with GPT-5.5.** _(Recommended: leave it to Stage 9, which owns the handoff and may change how it is confirmed. Stage 8 makes it visible: the detail shows the intent, the confidence and the rationale that led to the transfer. The finding is recorded in the Stage 9 issue.)_
9. **A distinct action for questions with options.** Stage 7 kept `perguntar` under "respondeu" and left this to Stage 8. _(Recommended: add `perguntou`, used when `perguntar` ran and nothing more important happened, below `pediu_esclarecimento` in the order of actions, so low-confidence questions keep their own action. "Respondeu" for a question with options reads wrong in the detail.)_
10. **What the analyst gets in this stage.** The console is Stage 9. _(Recommended: the detail as a standalone component and an analyst-only route, `GET /api/analyst/conversations/:id`, returning the messages with their records in the employee route's shape. It is tested now and has no screen yet; Stage 9 builds the console around both. Building a temporary analyst page now would be thrown away.)_
11. **Who the rationale is written for.** The employee reads it in the chat and the analyst in the console. _(Recommended: one text for both, in the third person and neutral ("A pessoa pediu o status sem dizer o número; havia três chamados abertos, então perguntei qual."), one or two sentences, no tool names or rule codes, which the detail already shows. The server-written rationale ("Você confirmou o rascunho D-381.") becomes "A pessoa confirmou o rascunho D-381." to match.)_
