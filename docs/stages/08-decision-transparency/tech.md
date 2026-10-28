# Stage 08 — Decision transparency: tech spec

|        |                                                            |
| ------ | ---------------------------------------------------------- |
| Issue  | [#8](https://github.com/paulojnneto/service-desk/issues/8) |
| PRD    | `prd.md` (approved on 2026-10-28)                          |
| Status | Approved on 2026-10-28                                     |

## Solution overview

The decision record already exists (Stage 6). This stage makes it richer where the PRD asks for it, sends it with the live reply, and shows it.

```
agent turn ──► tool parts ──► buildDecisionRecord(parts) ──┬──► message-metadata chunk ──► live reply
                               + enforced rules (table)     │     (before "finish")
                               + one subject per tool       └──► decisions table ──► conversation route
                               + perguntou, registered                               analyst route
confirm / cancel ──► decision written by code (source "server") ──► same two paths
                                                                         │
UI: action line + "Por quê?" ──► <DecisionDetail record> ◄── catalog of labels (@nexo/shared)
```

- **The record grows by four fields**, all produced by code:
  - `enforcedRules`: the Annex A rules that the tools that ran enforce, from a fixed table (PRD decision 5). `rules` keeps only what the model cited.
  - `tools[].subject`: one short, safe argument per tool, chosen by code per tool (PRD decision 6).
  - `source`: `"agent"` for a model turn, `"server"` for the replies written after Confirm or Cancel (S-08.7).
  - `registered`: `false` when the model did not call `registrarDecisao` (S-08.8), so the UI does not have to recognise a rationale string.
- **A new action, `perguntou`** (PRD decision 9), below `pediu_esclarecimento` in the order of actions.
- **The live reply gets its record.** The chat route no longer merges the agent's stream as is. It copies every chunk to the client except `finish`, assembles the reply with `readUIMessageStream` on a copy of the stream, builds the record once, writes a `message-metadata` chunk with it, and only then the `finish`. The same record object is saved in `onEnd`, so live and stored cannot differ (S-08.4).
- **One catalog of labels** in `@nexo/shared` turns every intent, action, confidence, outcome, tool and rule into Portuguese. Each map is a `Record` over the zod enum, so a new value fails the typecheck until it has a label (PRD decision 4).
- **The detail is a standalone component**, `DecisionDetail`, in `apps/web/src/components/decision/`, which takes only a `DecisionRecord`. A pure function, `decisionView(record)`, turns the record into the rows the component shows; it is what the tests cover. The chat puts a "Por quê?" control at the end of the action line, which opens the detail inline under it (PRD decision 1).
- **Server-written replies** have no tool parts. Their action line comes from the record's tools ("criou o INC-20312", "cancelou o rascunho D-381").
- **The analyst route**, `GET /api/analyst/conversations/:id`, returns a `ConversationView` for any conversation, analyst role only (PRD decision 10).
- **The agent's instructions** change in two places: how to write the rationale (S-08.10) and that any reopening request goes through `prepararReabertura` (S-08.11). The scripted model's rationales are rewritten to match.

## Files and modules

| Path                                                   | What changes                                                                                                                                                       | Why                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| `packages/shared/src/decisions.ts`                     | `RuleId` and `ToolName` enums; `perguntou`; `DecisionRecord` gains `enforcedRules`, `source`, `registered`, `tools[].subject`; `ENFORCED_RULES` table              | S-08.5 to S-08.7, S-08.11 |
| `packages/shared/src/decision-labels.ts`, test         | Labels for intent, action, confidence (word and meaning), outcome, tool (with subject) and rule (code and title)                                                   | S-08.2, S-08.3            |
| `packages/agent/src/decision.ts`, test                 | `buildDecisionRecord` fills `enforcedRules`, `subject`, `registered`, `source: "agent"`; `perguntou` in `actionOf`                                                 | S-08.5, S-08.6, S-08.8    |
| `packages/agent/src/tools/decision.ts`                 | `RULE_IDS` moves to `@nexo/shared`; the description of `justificativa` says who it is for and what it must not contain                                             | S-08.10                   |
| `packages/agent/src/tools/drafts.ts`                   | `prepararReabertura` description: call it for any reopening request; the tool checks the 7 days                                                                    | S-08.11                   |
| `packages/agent/src/agents/instructions.ts`, test      | The reopening line and a "Justificativa" paragraph in "Registro da decisão"                                                                                        | S-08.10, S-08.11          |
| `packages/agent/src/models/nexo-script.ts`             | Every scripted rationale rewritten in the neutral form                                                                                                             | S-08.10, S-08.14          |
| `apps/api/drizzle/0002_*.sql`, `src/db/schema.ts`      | `decisions` gains `enforced_rules`, `source`, `registered`, with defaults and a backfill                                                                           | S-08.6, S-08.7, S-08.8    |
| `apps/api/src/conversations/repository.ts`, `to-ui.ts` | Write and read the new columns; `findConversationById`                                                                                                             | S-08.12                   |
| `apps/api/src/routes/chat.ts`                          | `withDecision(stream)`: holds `finish`, writes `message-metadata` with the record; `onEnd` saves the same record                                                   | S-08.4                    |
| `apps/api/src/drafts/confirm.ts`                       | Server decisions with `source: "server"`, `enforcedRules`, subjects (ticket number, draft number) and neutral rationales; cancel records a `cancelarRascunho` tool | S-08.7, PRD decision 11   |
| `apps/api/src/routes/analyst.ts`, test; `app.ts`       | `GET /api/analyst/conversations/:id`                                                                                                                               | S-08.12                   |
| `apps/web/src/components/decision/view.ts`, test       | `decisionView(record)`: the rows of the detail, rules split and deduplicated                                                                                       | S-08.1 to S-08.8          |
| `apps/web/src/components/decision/decision-detail.tsx` | The detail                                                                                                                                                         | S-08.1, S-08.12, S-08.13  |
| `apps/web/src/components/decision/why-toggle.tsx`      | "Por quê?" control, with the confidence when it is média or baixa                                                                                                  | S-08.3, S-08.13           |
| `apps/web/src/components/chat/messages.tsx`            | The control in the action line; the detail under it; "sem registro de decisão" for an agent reply without a record                                                 | S-08.1, S-08.8            |
| `apps/web/src/components/chat/parts.ts`, test          | `actionLabels` falls back to the record's tools for server replies                                                                                                 | S-08.7                    |
| `README.md`                                            | "How the agent decides": reading a decision; the enforced-rules table                                                                                              | S-08.15                   |

## Decisions

| Decision                       | Choice                                                                                                                                                                      | Alternatives considered                                                   | Reason                                                                                                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sending the record live        | Hold the `finish` chunk, assemble the reply with `readUIMessageStream` on a `tee` of the stream, write a `message-metadata` chunk, then `finish`                            | Build it in the browser from the parts; a second request after the stream | PRD decision 2. One builder, one object for the stream and the table. A second request adds a round trip and a moment where the reply has no record                         |
| Where the record is built      | Once, inside `execute`, kept in a variable that `onEnd` saves                                                                                                               | Build again in `onEnd` from `responseMessage.parts`                       | The same object reaches the client and the table; the acceptance criterion "identical after a reload" holds by construction                                                 |
| Cited and enforced rules       | Two columns, `rules` (model) and `enforced_rules` (code). The detail shows enforced ones first and, under "aplicadas pelo agente", only the cited ones not already enforced | One merged list; a flag per rule                                          | PRD decision 5. Keeping `rules` unchanged keeps Stage 6 data and tests valid                                                                                                |
| Enforced-rules table           | See Contracts. R8 counts as enforced only with intent `fora_do_escopo` and no draft or handoff in the turn                                                                  | Leave R8 to the model                                                     | Code can only guarantee that nothing was written for an out-of-scope request; the record says exactly that                                                                  |
| Subject per tool               | A function per tool in `buildDecisionRecord`: ticket number (upper case), search term (first 80 characters), draft kind; nothing for the others                             | Store the whole input                                                     | PRD decision 6. The handoff summary and draft descriptions can be long and personal; the analyst reads the record without the parts                                         |
| Missing `registrarDecisao`     | `registered: false`, plus the Stage 6 fallback values; the UI shows its own fixed text                                                                                      | Recognise the rationale "O modelo não registrou a decisão."               | A flag cannot drift with a wording change. The backfill sets it for old rows from that rationale                                                                            |
| Server replies                 | `source: "server"`; tools `criarChamado`, `atualizarChamado`, `reabrirChamado` with the ticket number, `cancelarRascunho` with "D-381"; `rules: []`, all in `enforcedRules` | A separate type of record                                                 | Same component, same table; the detail says "Decidido pelo sistema, depois da confirmação" instead of showing a model's confidence as if it were a judgment                 |
| Action line of server replies  | `actionLabels` uses the record's tools when the message has no tool parts and `source` is `server`                                                                          | Add fake tool parts to the stored reply                                   | The parts stay what really happened; the record already says what the server did                                                                                            |
| Detail placement and state     | Under the action line, before the cards and the bubble; open state in the component, not stored                                                                             | After the bubble; a side panel                                            | PRD decision 1. Next to the line it explains, and the cards do not move sideways                                                                                            |
| Confidence colors              | alta `success`, média `warning`, baixa `danger`, always with the word; `aria-label` on the dot is not needed because the word is text                                       | Icons only                                                                | S-08.3: never color alone; reuses the existing tokens                                                                                                                       |
| Labels of tools in the detail  | `TOOL_LABELS` in the catalog, one phrase per tool with its subject                                                                                                          | Reuse the action line's labels from `parts.ts`                            | The action line has several labels per tool ("calculou o prazo") and lives in the web app; the detail needs one phrase per tool and must be shared with the analyst console |
| The analyst route's shape      | `{ conversation: ConversationView }`, the same as the employee's                                                                                                            | A decisions-only route                                                    | PRD decision 10; Stage 9 renders the same messages and cards                                                                                                                |
| A rationale that leaks R7 data | Prevented by the instructions and checked by the scripted flow and the manual run; no redaction in code                                                                     | Search the rationale for names from the directory                         | A filter would miss most leaks (a ticket title) and hide honest text. The rationale is the model's; the tools and outcomes beside it are code's                             |
| Web tests                      | Vitest on `decisionView`, the catalog and `actionLabels`; manual check in the browser                                                                                       | Testing Library and jsdom                                                 | Same as Stage 7: the logic that can break is pure                                                                                                                           |

## Contracts

```ts
// packages/shared/src/decisions.ts
export const RuleId = z.enum(["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9"]);
export const ToolName = z.enum([
  // agent
  "consultarHorario",
  "buscarNaCentral",
  "listarMeusChamados",
  "consultarChamado",
  "prepararChamado",
  "prepararAtualizacao",
  "prepararReabertura",
  "descartarRascunho",
  "transferirParaAnalista",
  "perguntar",
  // server, after Confirm or Cancel
  "criarChamado",
  "atualizarChamado",
  "reabrirChamado",
  "cancelarRascunho",
]);
// DecisionAction gains "perguntou".

export const DecisionRecord = z.object({
  intent: Intent,
  action: DecisionAction,
  confidence: Confidence,
  rationale: z.string(),
  rules: z.array(RuleId), // cited by the model
  enforcedRules: z.array(RuleId), // guaranteed by code (new)
  tools: z.array(
    z.object({
      name: z.string(), // a ToolName; an unknown name is kept and labelled as is
      outcome: ToolOutcome,
      subject: z.string().optional(), // new
    }),
  ),
  source: z.enum(["agent", "server"]), // new
  registered: z.boolean(), // new
});
```

Enforced rules (`ENFORCED_RULES`), applied to tools whose outcome is `ok` unless noted:

| Tool or condition                                                                   | Rules                         |
| ----------------------------------------------------------------------------------- | ----------------------------- |
| `listarMeusChamados`, `consultarChamado`, `perguntar` with tickets (any outcome)    | R7                            |
| `consultarChamado`                                                                  | R9                            |
| `prepararChamado`                                                                   | R3, R4, R9                    |
| `prepararAtualizacao`                                                               | R3, R7                        |
| `prepararReabertura` (`ok` or `recusado`)                                           | R5, R7; R3 if `ok`            |
| `transferirParaAnalista`                                                            | R6                            |
| Intent `fora_do_escopo` and no draft or handoff ran                                 | R8                            |
| Server: `criarChamado` / `atualizarChamado` / `reabrirChamado` / `cancelarRascunho` | R3, R4, R9 / R3 / R3, R5 / R3 |

Order of actions (Stage 6 plus `perguntou`): `transferiu` › `preparou_rascunho` › `recusou_reabertura` › `descartou_rascunho` › `consultou_chamados` › `respondeu_central` › `redirecionou` › `pediu_esclarecimento` › `perguntou` › `respondeu`.

Catalog (`packages/shared/src/decision-labels.ts`), a sample:

```ts
INTENT_LABELS.status_chamado; // "Quer saber o status de um chamado"
ACTION_LABELS.recusou_reabertura; // "Explicou por que o chamado não pode ser reaberto"
CONFIDENCE_LABELS.media; // { word: "média", meaning: "Entendeu o pedido, mas precisou supor algo." }
OUTCOME_LABELS.indisponivel; // "sistema de chamados fora do ar"
TOOL_LABELS.consultarChamado("INC-20311"); // "Consultou o INC-20311"
RULE_LABELS.R5; // { code: "R5", title: "Reabertura em até 7 dias" }
```

Live stream of a reply, the end:

```
… tool and text chunks …
{ type: "message-metadata", messageMetadata: { author: "agent", createdAt, decision } }
{ type: "finish" }
```

Analyst route:

```
GET /api/analyst/conversations/:id   (analyst only)
200 { conversation: ConversationView }   // messages with metadata.decision, drafts
400 invalid_id | 401 | 403 (employee) | 404 not_found | 503 unavailable
```

Migration `0002`:

```sql
alter table decisions add column enforced_rules text[] not null default '{}';
alter table decisions add column source text not null default 'agent'
  check (source in ('agent', 'server'));
alter table decisions add column registered boolean not null default true;
update decisions set source = 'server'
  where action in ('criou_chamado', 'atualizou_chamado', 'reabriu_chamado', 'cancelou_rascunho');
update decisions set registered = false where rationale = 'O modelo não registrou a decisão.';
```

Old rows keep empty `enforced_rules` and no subjects; the detail shows what they have.

Instructions, the new lines (Portuguese, as the rest):

- Reabrir: "Para qualquer pedido de reabertura, chame prepararReabertura, mesmo que o chamado pareça antigo: o sistema confere o prazo de 7 dias. Não decida pela data."
- Justificativa: "Uma ou duas frases neutras, que o funcionário e o analista entendam: o que foi pedido e por que você seguiu esse caminho. Fale da pessoa na terceira pessoa ('A pessoa pediu…'). Não cite nomes de ferramentas, códigos de regra ou de intenção, nem dados de outra pessoa ou se um chamado de outra pessoa existe."

## Error handling

| What fails                                                      | What the reader sees                                                                                 | Logs            |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------- |
| The reply stream errors or is aborted                           | As in Stage 5: no `message-metadata`, nothing saved, "Tentar de novo"                                | As in Stage 5   |
| `readUIMessageStream` fails while assembling                    | The reply still reaches the client; its record is built from what was assembled; the error is logged | `console.error` |
| The model skipped `registrarDecisao`                            | "O agente não registrou a decisão", confidence baixa, the tools that ran                             | As in Stage 6   |
| An agent reply has no record (before Stage 6, or a failed save) | "Sem registro de decisão para esta resposta" in the detail; the control still opens                  | —               |
| A tool name or rule the catalog does not know (old data)        | The raw name is shown; the typecheck prevents it for new values                                      | —               |
| Analyst route with a malformed id                               | `400 invalid_id`                                                                                     | —               |
| Analyst route with the database down                            | `503 unavailable`                                                                                    | `console.error` |

## Test plan

| What                                                                                                                                                      | Type                  | Why it is worth testing         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------- |
| `buildDecisionRecord`: enforced rules per tool and outcome; R8 only without writes; subjects; `perguntou` and its place in the order; `registered: false` | Unit (agent)          | S-08.5, S-08.6, S-08.8, S-08.11 |
| Refused reopening: `recusou_reabertura`, R5 and R7 enforced, subject "INC-19877"                                                                          | Unit (agent)          | S-08.11, acceptance criterion   |
| Instructions contain the reopening and rationale lines; tool descriptions say the same                                                                    | Unit (agent)          | S-08.10, S-08.11                |
| Every catalog map covers its enum (and the typecheck enforces it)                                                                                         | Unit (shared)         | S-08.2                          |
| Live stream: the last chunks are `message-metadata` then `finish`; its decision deep-equals the stored one returned by the conversation route             | Route (API)           | S-08.4                          |
| A failed stream sends no `message-metadata` and saves nothing                                                                                             | Route                 | Stage 5 guarantee kept          |
| Confirm and cancel: `source: "server"`, enforced rules, subjects, neutral rationale                                                                       | Route                 | S-08.7                          |
| Analyst route: 200 for an analyst with records; 403 for an employee; 404 unknown id; 400 malformed id                                                     | Route                 | S-08.12                         |
| Migration backfill: server actions become `source: "server"`; the old missing rationale becomes `registered: false`                                       | Integration (API)     | S-08.8 for old rows             |
| Simulated flows: every reply has a record with `registered: true`, a rationale with no tool names or rule codes                                           | Flow (API, simulated) | S-08.10, S-08.14                |
| "Mostre o chamado REQ-10439" as Ana: outcome `nao_encontrado`; reply and rationale do not contain "Carla"                                                 | Flow                  | S-08.9                          |
| `decisionView`: rows in order, rules split and deduplicated, server note, missing and absent records, confidence summary only for média and baixa         | Unit (web)            | S-08.1 to S-08.8                |
| `actionLabels` for a server reply: "criou o INC-20312"                                                                                                    | Unit (web)            | S-08.7                          |

Manual validation in the browser, as Ana, on the user's running `pnpm dev`:

1. **Screen 2.** VPN with error 809 to the draft: open "Por quê?" on each reply; no codes; R3 and R9 under "garantidas pelo sistema" on the draft reply. Confirm, then open the server reply's detail.
2. **Live.** The detail opens before any reload; reload and compare.
3. **Screen 3.** Status, picker, INC-20311 card; the question-only reply shows "perguntou".
4. **Reopening.** "Quero reabrir o INC-19877": `recusou_reabertura`, R5 enforced.
5. **Privacy.** "Mostre o chamado REQ-10439": "não encontrado", no mention of Carla.
6. **Low confidence.** A vague message: "confiança baixa" on the collapsed control.
7. **Keyboard and width.** Tab to "Por quê?", Enter, Esc does nothing unexpected; 375 px.
8. **Analyst.** Sign in as an analyst and call the route with Ana's conversation id; as Ana, 403.
9. **Real model.** Only after asking: Screens 2 and 3, the reopening refusal and the handoff with `openai/gpt-5.5`.

## Commit plan

1. `docs(stage-08): tech spec` — this document.
2. `feat(shared): decision labels and the enforced rules of the decision record`
3. `feat(agent): enforced rules, tool subjects and perguntou in the decision record`
4. `feat(agent): readable rationales and every reopening checked by the tool`
5. `feat(api): decisions migration and server decisions marked as such`
6. `feat(api): the decision record in the live reply`
7. `feat(api): analyst route for a conversation with its decisions`
8. `feat(web): decision detail behind "Por quê?" on every reply`
9. `docs: reading a decision in the README`

## Risks

| Risk                                                                                    | Mitigation                                                                                                                                                       |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Holding `finish` and teeing the stream breaks streaming or the save on a closed browser | The copy drained by `consumeSseStream` stays; a route test covers the chunk order and the save; the manual run closes the tab mid-reply                          |
| Mastra's stream sends its own `message-metadata` or a `finish` with metadata            | Our chunk comes last before `finish` and carries the full metadata (`author`, `createdAt`, `decision`), so it wins on the client                                 |
| A real model still writes rationales with tool names or in the second person            | The detail shows tools and rules separately, so the damage is style. Noted in the manual run; Stage 10 measures it                                               |
| A real model still skips `prepararReabertura`                                           | The record stays honest (`consultou_chamados`) and the detail shows intent `reabrir_chamado` with no R5 enforced, which a reviewer notices. Stage 10 measures it |
| The detail adds noise to every reply                                                    | Collapsed by default; only média and baixa show anything extra on the line                                                                                       |
| The analyst route exposes any conversation to any analyst                               | Intended: analysts serve every employee (A2). The route is read only and requires the analyst role from the session                                              |
