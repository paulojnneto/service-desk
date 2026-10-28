# Stage 07 — Chat cards and flows: tech spec

|        |                                                            |
| ------ | ---------------------------------------------------------- |
| Issue  | [#7](https://github.com/paulojnneto/service-desk/issues/7) |
| PRD    | `prd.md` (approved on 2026-10-28)                          |
| Status | Approved on 2026-10-28                                     |

## PRD clarification (approved with this spec)

Decision 4 says a note in the conversation lets the agent see an edit. The agent does not read system notes: since Stage 5 its history has only the employee's and its own messages, and Stage 9 decides how it reads the others. So the edit has two parts:

- **The note**, "Você editou o rascunho D-381.", shows the employee what happened.
- **The agent** learns about the edit from the waiting draft, which goes into its instructions on every turn with the current fields.

The effect is what the PRD asks for. Only the way the agent learns changes.

## Solution overview

The cards are built from the **tool parts** that the agent's reply already stores (AI SDK `UIMessage` parts), plus the **current state of the drafts**. Nothing is parsed from text.

```
agent turn ──► tool parts in the stored reply ──► UI picks a card for each part
   │              consultarChamado  → ticket card (snapshot, with the time read)
   │              perguntar         → options or ticket picker
   │              preparar*         → draft card ◄── current draft state (conversation route,
   │                                                  confirm, cancel and edit routes)
   └─ the instructions include the waiting draft with its current fields
```

- **`perguntar` (new tool).** It takes a question and either two to five options or up to eight ticket numbers. It writes nothing.
  - For tickets, it lists the employee's open tickets and keeps only those numbers, in the given order. The picker therefore shows only the employee's own open tickets, with data from the ticket service (R7).
  - The question lives in the tool's output, not in the text. The UI shows the question and its options below the reply.
  - The employee's answer is an ordinary message: the option's text, or "NÚMERO · título" for a ticket.
- **Answered or waiting** is derived from the history. A question is waiting only if it belongs to the last message and that message is from the agent. Otherwise the employee's next message is the answer, and an option whose text equals it is shown as chosen. No new state is stored, and a reload shows the same thing.
- **Ticket card.** It comes from the `consultarChamado` output, which already has every field the card shows. It is a snapshot: "há 5 dias" is counted from the time of the reply, and the card shows "consultado em 28/10, 14:20".
- **Draft card.** It replaces `draft-block.tsx`. The tool part gives the draft's id; the card reads its current state from a map in the chat, `draftsById`. That map is filled by:
  - the conversation route, which now returns every draft of the conversation;
  - new drafts streamed in a reply;
  - the responses of confirm, cancel and edit.
- **Edit.** A form in the card calls `PATCH /api/drafts/:id`. The server:
  - validates the fields per kind;
  - for a new ticket, recalculates the priority with `priorityFor` and the deadline with `dueAt`, and runs the duplicate check again when the category changed;
  - updates the same draft;
  - stores the system note.
- **Keyboard.** A `useChatShortcuts` hook in the chat handles two things:
  - Ctrl+Enter or ⌘+Enter confirms the waiting draft.
  - With the composer empty, the digits 1 to N pick the options of the waiting question.
  - The picker is a `radiogroup` with arrow keys; Esc closes the edit form.
- **Action line.** The labels come from a function of the tool name and its input ("consultou o INC-20311"). The UI only builds them from parts that ran. `perguntar` and `registrarDecisao` are not shown.
- **Scripted model.** The flows of Screens 2 and 3 call `perguntar`:
  - who is affected and the urgency, as options;
  - the open tickets, as a picker;
  - after an overdue ticket card: "Falar com um analista", "Adicionar informação" or "Não, obrigado".

## Files and modules

| Path                                                             | What changes                                                                                                     | Why                                                  |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `packages/shared/src/questions.ts`                               | `QuestionView`: `{kind: "options", question, options}` or `{kind: "tickets", question, tickets: TicketChoice[]}` | Contract of what the UI renders (S-07.2, S-07.3)     |
| `packages/shared/src/drafts.ts`                                  | `EditDraftInput` per kind; `DraftView` gets `createdAt`                                                          | Edit route body (S-07.6)                             |
| `packages/shared/src/conversations.ts`                           | `ConversationView.drafts: DraftView[]`                                                                           | Current state of every draft after a reload (S-07.7) |
| `packages/agent/src/tools/question.ts`                           | `perguntar`                                                                                                      | S-07.11                                              |
| `packages/agent/src/context.ts`                                  | `NexoContext.waitingDraft?: DraftView`                                                                           | The agent sees edits (PRD clarification)             |
| `packages/agent/src/agents/instructions.ts`                      | When to use `perguntar`; the waiting draft with its current fields                                               | S-07.13                                              |
| `packages/agent/src/agents/nexo-assist.ts`                       | Registers `perguntar`                                                                                            |                                                      |
| `packages/agent/src/models/nexo-script.ts`                       | VPN, status and overdue flows use `perguntar`; answers to the overdue options                                    | S-07.12                                              |
| `apps/api/src/drafts/edit.ts`                                    | `editDraft(deps, id, input)`                                                                                     | S-07.6                                               |
| `apps/api/src/drafts/repository.ts`                              | `updatePendingDraft` (conditional on `pending`), `listDrafts(conversationId)`                                    |                                                      |
| `apps/api/src/routes/drafts.ts`                                  | `PATCH /:id`                                                                                                     |                                                      |
| `apps/api/src/routes/conversations.ts`, `conversations/to-ui.ts` | Return `drafts`                                                                                                  | S-07.7                                               |
| `apps/api/src/routes/chat.ts`                                    | Puts the waiting draft in the request context                                                                    |                                                      |
| `apps/web/src/components/chat/cards/ticket-card.tsx`             | Ticket card, its placeholder and its error                                                                       | S-07.1, S-07.8                                       |
| `apps/web/src/components/chat/cards/ticket-picker.tsx`           | Picker, placeholder, answered state                                                                              | S-07.2, S-07.4                                       |
| `apps/web/src/components/chat/cards/quick-question.tsx`          | Question with options, answered state                                                                            | S-07.3, S-07.4                                       |
| `apps/web/src/components/chat/cards/draft-card.tsx`              | Draft card with every state; replaces `draft-block.tsx`                                                          | S-07.5, S-07.7                                       |
| `apps/web/src/components/chat/cards/draft-form.tsx`              | Edit form                                                                                                        | S-07.6                                               |
| `apps/web/src/components/chat/cards/card-shell.tsx`              | Shared frame, placeholder and error line                                                                         | Same look for every card                             |
| `apps/web/src/components/chat/parts.ts`                          | Pure functions: `cardsOf(message)`, `actionLabels(parts)`, `waitingQuestion(messages)`, `chosenOption(...)`      | Logic testable without a DOM                         |
| `apps/web/src/components/chat/use-chat-shortcuts.ts`             | Keyboard shortcuts                                                                                               | S-07.9                                               |
| `apps/web/src/components/chat/messages.tsx`, `chat.tsx`          | Render the cards; `draftsById`; `pickOption` sends a message                                                     |                                                      |
| `apps/web/src/lib/api.ts`                                        | `editDraft`                                                                                                      |                                                      |
| `apps/web/src/lib/format.ts`                                     | Dates and relative times in São Paulo time, status and priority labels                                           | Shared by the cards                                  |
| `README.md`                                                      | Flows of Screens 2 and 3 with the cards; shortcuts                                                               |                                                      |

## Decisions

| Decision                           | Choice                                                                       | Alternatives considered              | Reason                                                                                                                                                    |
| ---------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where the question text lives      | In the `perguntar` output; the reply text only leads into it                 | Repeat it in the text; or text only  | Avoids saying the question twice; the card always has its question                                                                                        |
| Answered state                     | Derived from the history                                                     | Store an `answeredAt` on the message | Nothing new to keep in sync, and a reload gives the same result                                                                                           |
| Ticket card data                   | `consultarChamado` output, as stored                                         | Fetch on render                      | PRD decision 3; no load on the legacy service per card                                                                                                    |
| Draft state on the client          | `draftsById` map, filled from the server                                     | Keep the snapshot in the tool part   | The tool part is the moment it was prepared; edit, confirm and cancel change it later                                                                     |
| Recalculating duplicates on edit   | Only when the category changed                                               | Always; or never                     | The list shown on the card stays correct without an extra call per edit                                                                                   |
| The edit note and the limit        | Stored as a `system` message, which the limit does not count                 | An `employee` message                | PRD decision 4; the limit counts only what the employee sends                                                                                             |
| `perguntar` in the decision record | Listed in `tools`, no new action                                             | A new `perguntou` action             | Stage 6's actions describe what happened to tickets and the conversation; asking is already "respondeu" or "pediu_esclarecimento". Stage 8 can revisit it |
| Options limits                     | 2 to 5 options of up to 40 characters; up to 8 tickets                       | No limit                             | They fit as buttons and as digits 1 to 5                                                                                                                  |
| Ctrl+Enter scope                   | Confirms the waiting draft from anywhere in the chat, including the composer | Only when the card has focus         | As in the prototype, which shows the shortcut on the button; Enter still sends the composer                                                               |
| Web tests                          | Pure functions in `parts.ts` with Vitest, plus a manual check in the browser | Add Testing Library and jsdom        | The logic that can break (which card, waiting or answered, labels) is pure; adding a DOM test stack is out of proportion for this stage                   |

## Contracts

```ts
// packages/shared/src/questions.ts
export const TicketChoice = z.object({
  number: z.string(),
  title: z.string(),
  status: TicketStatus,
  openedAt: z.string(),
});
export const QuestionView = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("options"),
    question: z.string(),
    options: z.array(z.string().max(40)).min(2).max(5),
  }),
  z.object({
    kind: z.literal("tickets"),
    question: z.string(),
    tickets: z.array(TicketChoice).min(1).max(8),
  }),
]);
```

`perguntar` (input in Portuguese, like the other tools):

```ts
z.object({
  pergunta: z.string().min(3).max(200),
  opcoes: z.array(z.string().min(1).max(40)).min(2).max(5).optional(),
  chamados: z.array(z.string()).min(1).max(8).optional(),
}); // exactly one of opcoes or chamados
// output: { pergunta: QuestionView } | { indisponivel: true, ... } | { encontrado: false }
```

`PATCH /api/drafts/:id` (employee only):

```ts
// body, by the draft's kind
{ kind: "create", fields: { type, title, description, category, impact, urgency } }
{ kind: "update", fields: { message } }
{ kind: "reopen", fields: { reason } }
// 200 { draft: DraftView, message: StoredMessage }  // message is the system note
// 400 invalid_input | 404 not_found | 409 draft_in_progress | 409 draft_closed | 503 unavailable
```

`GET /api/conversations/current` gains `drafts: DraftView[]`, all the drafts of the conversation, oldest first. `pendingDraftId` stays.

Action labels (`actionLabels`):

| Tool                                        | Labels                                                              |
| ------------------------------------------- | ------------------------------------------------------------------- |
| `consultarChamado`                          | "consultou o {numero}", "calculou o prazo"                          |
| `prepararChamado`                           | "classificou a prioridade", "calculou o prazo", "montou o rascunho" |
| `prepararAtualizacao`, `prepararReabertura` | "consultou o {numero}", "montou o rascunho"                         |
| others                                      | as in Stage 6                                                       |

A refused or failed part keeps only its first label, so the line never claims a draft that was not made.

## Error handling

| What fails                                           | What the employee sees                                                                                                                     | Logs                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| `consultarChamado` unavailable                       | Instead of the card: "Não consegui consultar o INC-20311 agora: o sistema de chamados não respondeu." The agent's text offers to try again | Stage 4 client retries |
| `consultarChamado` not found                         | No card; the agent's text explains (same answer as another person's ticket)                                                                | —                      |
| `perguntar` with tickets while the service is down   | Instead of the picker: "Não consegui listar seus chamados agora." The agent can still ask in text                                          | —                      |
| `perguntar` with no valid ticket                     | No picker; the model gets `encontrado: false` and answers in text                                                                          | —                      |
| A tool still running                                 | Placeholder with the card's shape and "consultando…"                                                                                       | —                      |
| Edit refused by validation                           | The field shows the message and the form stays open                                                                                        | —                      |
| Edit on a draft no longer pending                    | "Este rascunho não pode mais ser editado."; the card reloads its state                                                                     | —                      |
| Edit with the service down while checking duplicates | "Não consegui salvar agora. Tente de novo."; the draft is unchanged                                                                        | `console.error`        |
| Confirm unavailable                                  | As in Stage 6, with a "Tentar de novo" button in the card                                                                                  | As in Stage 6          |

## Test plan

| What                                                                                                                  | Type                  | Why it is worth testing                        |
| --------------------------------------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------- |
| `perguntar` keeps only the employee's open tickets, in order; refuses both or neither of `opcoes` and `chamados`      | Unit (agent)          | R7 in the picker                               |
| Edit: priority and deadline recalculated; duplicates recalculated when the category changes; same draft id and number | Route (API)           | S-07.6                                         |
| Edit refused: another person's draft (404), not pending (409), invalid fields (400), analyst (403)                    | Route                 | Same guarantees as confirm                     |
| The edit note is stored as `system` and does not count toward the limit                                               | Route                 | PRD decision 4                                 |
| Conversation route returns `drafts` with their current status after confirm, cancel and replace                       | Route                 | S-07.7                                         |
| The waiting draft reaches the instructions with its current fields                                                    | Unit (agent)          | PRD clarification                              |
| Screen 2 flow: options for who is affected → urgency → draft → confirm                                                | Flow (API, simulated) | First acceptance criterion                     |
| Screen 3 flow: picker with the 3 open tickets → "INC-20311 · …" → card with `vencido` → the three options             | Flow                  | Second acceptance criterion                    |
| `cardsOf`, `actionLabels`, `waitingQuestion`, `chosenOption`                                                          | Unit (web)            | Which card, waiting or answered, honest labels |

Manual validation in the browser, as Ana:

1. **Screen 2.** VPN with error 809 → "Windows 11" → click "Só eu" → click the urgency → check the card against the prototype → Ctrl+Enter → "Criado · INC-20312".
2. **Screen 3.** "Qual o status do meu chamado?" → pick with the arrow keys and Enter → check the INC-20311 card → click "Falar com um analista".
3. **Edit.** Change who is affected to "Toda a empresa" and check the priority; invalid title; Esc.
4. **States.** Stop the ticket service and ask for a ticket; confirm a draft with the service down, then "Tentar de novo".
5. **Reload.** The answered options stay disabled, and old drafts show their current state.
6. **Width.** 375 px.
7. **Real model.** The same flows with `openai/gpt-5.5`.

## Commit plan

1. `docs(stage-07): tech spec` — this document.
2. `feat(shared): question, draft edit and conversation draft contracts`
3. `feat(agent): perguntar tool and the waiting draft in the instructions`
4. `feat(api): edit drafts and return draft states with the conversation`
5. `feat(agent): screens 2 and 3 in the simulated flows`
6. `feat(web): ticket card, ticket picker and quick-reply options`
7. `feat(web): draft card with confirm, edit and cancel`
8. `feat(web): keyboard shortcuts and action labels from the prototype`
9. `docs: chat cards in the README`

## Risks

| Risk                                                                    | Mitigation                                                                                                                                                                      |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A real model writes the question in the text and also calls `perguntar` | The instructions say not to repeat it; the UI shows the card's question in a lighter style under the text, so a repeat reads as emphasis, not as a bug. Noted in the manual run |
| A real model forgets `perguntar` and asks in text                       | The chat still works, because typing an answer is always possible. Stage 10 measures how often                                                                                  |
| Global Ctrl+Enter conflicts with browser or OS shortcuts                | Handled only inside the chat page, with `preventDefault` only when a draft is waiting                                                                                           |
| Digits picking options surprise someone typing a number                 | Only with the composer empty and the focus outside the edit form; the hint "1–4" is shown on the options                                                                        |
| The tool part's snapshot and the draft's current state disagree         | The card always prefers `draftsById`; the snapshot is used only until the map has the draft                                                                                     |

## Deviations during implementation

Recorded after the code, before the pull request.

| Deviation                                                                                                                                                                                    | Why                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| The action labels landed with the cards (`feat(web): ticket card, ticket picker and quick-reply options`), not in the shortcuts commit                                                       | `messages.tsx` was rewritten for the cards, and the labels come from the same `parts.ts`                                |
| `perguntar` with both or neither of `opcoes` and `chamados` answers `permitido: false` instead of an error                                                                                   | The decision record then shows it as `recusado`, like the other refusals                                                |
| The ticket card comes before the reply text, and the picker's question ends the text bubble                                                                                                  | The prototype's order in Screen 3                                                                                       |
| `buildChatParams` takes `{ previousConfidence, waitingDraft }` instead of a fifth argument                                                                                                   | Two optional values read better by name                                                                                 |
| Extra commit: the simulated model asks the Windows version with options and names the day of a deadline that is not today                                                                    | Found in the browser check: "a resposta chega até 12:00" for a deadline the next day                                    |
| Extra commit: the employee shell (Stage 3 files) becomes a rail of icons below `md`                                                                                                          | Without it the sidebar took half of a 375 px screen and S-07.14 could not be met                                        |
| The "ticket service stopped" state was checked by tests (`cardsOf`, the draft routes), not in the browser                                                                                    | The local servers were the user's own `pnpm dev`; stopping them was not an option                                       |
| Manual run with GPT-5.5 stopped after Screens 2 and 3, at the user's request (cost)                                                                                                          | See the pull request for what it showed                                                                                 |
| Instructions changed after that run, without running the real model again: use the picker instead of listing tickets, do not repeat the draft's fields, ask the Windows version with options | GPT-5.5 listed the tickets in the text and repeated the draft, following Stage 6 lines written before the cards existed |
