# Stage 11 — Efficiency, resilience and security: PRD

|        |                                                              |
| ------ | ------------------------------------------------------------ |
| Issue  | [#11](https://github.com/paulojnneto/service-desk/issues/11) |
| Status | Approved on 2026-10-29                                       |
| Covers | N4, N5, N10, N11, N12, R7                                    |

## Problem

Stage 12 publishes the project, and today publishing it would mean an open bill and an unchecked surface:

- **No cost number.** The Stage 10 evals measured about 4 model calls and 14,000 input tokens per conversation with GPT-5.5. Nobody has turned that into money, or compared it with a cheaper model on the same scenarios.
- **The model was never chosen.** GPT-5.5 became the reference in Stage 6 because its key was at hand, and the reason it stays is still undecided.
- **Every call pays full price.** None of the 178,296 input tokens of the eval run were cached, although the instructions and the tool definitions are the same on every call.
- **The history grows with every tool output.** Each turn sends the stored conversation back to the model, including old ticket lists and help center articles that no longer matter.
- **Nothing limits usage.** The 30-message limit is per conversation, and "Nova conversa" starts a new one. Anyone signed in, with any sample email and any password (a challenge rule), can call the model without end.
- **Model failures are not bounded.** The ticket service has retries and timeouts (Stage 4), but a slow or failing model call has no timeout of its own and no retry.
- **No security review.** Privacy rules are tested one by one, but nobody has looked at the whole: logs, error bodies, analyst routes, sessions, secrets. `.env.example` still names Anthropic as the reference and has no OpenAI key.

## Goal

At the end of this stage, the model is chosen on measured quality, cost and speed, and the estimated cost per conversation is documented. Every call reuses a cached prefix and sends only the history that matters. Usage is limited per employee and in total, so a published deployment cannot run up an unexpected bill. Model failures fail fast and honestly. A written review shows that privacy, secrets and errors were checked, and the issues it finds are fixed.

## Requirements

| ID      | Requirement                                                                                                                                                                                                                                                                                                                                                  | Source         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| S-11.1  | **Usage per turn, recorded:** every agent turn stores, with its decision, the model, the model calls, the input, cached and output tokens, the duration and the estimated cost, so cost is known per conversation, per employee and per day                                                                                                                  | N10            |
| S-11.2  | **Prompt caching works:** the instructions and the tool definitions form a stable prefix, with what changes per request (the person, the time, the waiting draft) after it, and the provider reports cached input tokens on repeated calls. The eval report shows the cached share                                                                           | N10            |
| S-11.3  | **Lean history:** the model receives the whole text of the conversation, but tool outputs from earlier turns are reduced to what the agent still needs. The evals keep their pass rate, and the report shows the input tokens before and after                                                                                                               | N10            |
| S-11.4  | **Model choice by measurement:** the Stage 10 evals run with at least two candidate models. A table compares pass rate, cost per conversation and time per turn, and the README says which model is the default and why                                                                                                                                      | N3, N10        |
| S-11.5  | **Cost per conversation, documented:** the README gives the estimated cost of a typical conversation and of the longest one in the evals, with the prices used and the date they were read                                                                                                                                                                   | N10, Issue #11 |
| S-11.6  | **Per-employee limit:** each employee has a daily allowance of agent turns, counted on the server across conversations. A message past the limit is saved and answered with a fixed text, with no model call, saying when the allowance renews and how to reach the service desk                                                                             | N12, Issue #11 |
| S-11.7  | **Overall daily budget:** the estimated cost of all agent turns in a day has a ceiling. Past it, every employee gets the same fixed answer until the next day, and the analyst console keeps working                                                                                                                                                         | N12            |
| S-11.8  | **Limits are configuration:** the per-employee allowance and the daily budget come from the environment, with safe defaults, and the README explains them                                                                                                                                                                                                    | N7, N12        |
| S-11.9  | **Model calls fail fast:** a turn has a time limit, a transient provider error (rate limit, 5xx, timeout) is retried once, and anything else ends the turn with the honest error the chat already shows, with the message kept for "Tentar de novo"                                                                                                          | N4, N5         |
| S-11.10 | **Resilience reviewed:** the ticket service outage paths (reads, drafts, confirm, handoff, console panel) are listed with the test that covers each, and any path without one gets a test                                                                                                                                                                    | N5             |
| S-11.11 | **Privacy and security review:** a document lists what was checked (R7 on every route, analyst-only routes, sessions and cookies, CSRF, what logs and error bodies contain, the decision rationale, prompt injection, secrets) with the evidence for each, a test or a code reference. Every issue found is fixed or recorded as a follow-up with its reason | N11, R7        |
| S-11.12 | **No secrets in the code:** CI scans the repository and its history for keys, `.env.example` lists every variable with the current reference model and provider key, and no file in the web app reads a secret                                                                                                                                               | N11, Issue #11 |
| S-11.13 | The README explains the model choice, the cost per conversation, the limits and how to change them, and links the review                                                                                                                                                                                                                                     | N8             |

## Acceptance criteria

- [ ] After a conversation, each agent reply has its model, tokens (with cached tokens), model calls, duration and estimated cost stored.
- [ ] An eval run with the chosen model reports cached input tokens above zero, and fewer input tokens per conversation than the Stage 10 run, with the same pass rate.
- [ ] A comparison of at least two models on the full eval set is in `docs/evals/`, and the README names the default model and the reason.
- [ ] The README states the estimated cost of a typical and of the longest conversation, with the prices and their date.
- [ ] With the allowance set to 3, the fourth message of the day gets the fixed answer without a model call; another employee is not affected; the next day the count starts again.
- [ ] With the daily budget reached, every employee gets the fixed answer, and the analyst can still take over and reply.
- [ ] A model call that hangs past the time limit ends the turn with the error and "Tentar de novo"; a single 429 is retried once.
- [ ] The review document exists, every item has its evidence, and the issues found are fixed or listed.
- [ ] CI runs a secret scan; `.env.example` is complete and current.
- [ ] Lint, typecheck, tests, evals, build and CI pass.

## Out of scope

- Production observability: dashboards, alerts, tracing.
- Billing or quotas per company or department.
- A real sign-in with passwords. The challenge accepts any password for the sample people; the review states it.
- Load testing and horizontal scaling.
- Deployment itself and its secret store (Stage 12).

## Dependencies

- Stage 10: the evals, the usage per turn (`onAgentUsage`) and the GPT-5.5 baseline (`docs/evals/2026-10-29-gpt-5.5.md`).
- Stage 6: the decision record, stored per reply, which the usage joins.
- Stage 5: the chat route, the 30-message limit and "Tentar de novo".
- Stage 4: the ticket service client, with its retries and timeouts.
- Provider keys in `apps/api/.env.local` for the comparison runs, used only after asking. Today only `OPENAI_API_KEY` is set.

## Decisions

Resolved on 2026-10-29, all following the recommendation: GPT-5.5 is compared with one smaller OpenAI model on the full eval set, with Anthropic only if its key is provided; the evals' pass rate decides first, no default may fail an R3, R5, R6 or R7 scenario, and the cheaper model wins unless it is more than 1.5 times slower; prices come from the provider's pricing page, dated, in the README and in a constant in code; caching starts by finding why Stage 10 reported none, then keeps the static instructions and tools first and the dynamic lines last, proved by an eval report; the history keeps every text and the last reply's tool parts, and reduces older tool parts to name and subject; the limits are 40 agent turns per employee per day and a US$ 5 daily budget, from the environment, by São Paulo day; past a limit the message is saved and answered with a fixed text, and "falar com um analista" still hands off without the model; a turn has 60 seconds and one retry on a transient provider error; gitleaks runs in CI and once on the full history; a light per-address rate limit protects sign-in and chat; the review lives in `docs/security.md`.

## Open questions (resolved)

1. **Which models to compare.** _(Recommended: GPT-5.5, the reference, against one smaller OpenAI model that the same key reaches, on the full eval set, once each. Anthropic models join only if an `ANTHROPIC_API_KEY` is provided. Mastra makes the switch a configuration change. A comparison across several providers costs more than it tells for a demo of this size.)_
2. **What decides the model.** _(Recommended: the pass rate on the evals comes first, and no default may fail a scenario of R3, R5, R6 or R7, the rules that protect the employee and the data. Among models that pass those, the cheaper one wins unless its turns are clearly slower, for example more than 1.5 times the reference.)_
3. **Where prices come from.** _(Recommended: the provider's public pricing page, read on the day of the comparison, recorded with that date in the README and in a constant in code that the cost estimate uses. Prices change, and a dated number can be checked later.)_
4. **How to get cached tokens.** Stage 10 reported zero. _(Recommended: first find why. It may be the order of the prompt, a part that changes on every call ahead of the static text, or usage the provider reports under another field. Then keep the static instructions and the tools first and every dynamic line at the end, with the time to the minute. Prove it with the cached share in an eval report. If the chosen provider needs explicit cache markers, use them.)_
5. **How lean the history gets.** _(Recommended: keep every message's text; keep the tool parts of the last agent reply as they are; reduce older tool parts to their name and short subject, as the decision record already does (Stage 8). The 30-message limit already bounds the length. Summarizing older turns with the model is left out: it costs a call to save tokens.)_
6. **The limits' values.** _(Recommended: 40 agent turns per employee per day, about four full conversations, and a daily budget of US$ 5 for the published demo, both set by environment variables. The day follows São Paulo time, like the deadlines.)_
7. **What happens past a limit.** _(Recommended: the message is saved, so the analyst sees it, and a fixed agent reply explains the limit, when it renews, and that "Quero falar com um analista" still works. That request hands off without the model, through the same handoff service, with the reason "pedido do funcionário". An employee is never cut off from a person by a budget.)_
8. **Time limit and retry for model calls.** _(Recommended: 60 seconds per turn, and one retry, after a short wait, for a rate limit, a 5xx or a network error on a step. The Stage 10 turns took 3 to 23 seconds. Past the limit, the stream ends with the error the chat already shows.)_
9. **Secret scanning.** _(Recommended: the gitleaks GitHub Action on every push and pull request, plus one scan of the full history now. A key found in history is rotated, not only removed.)_
10. **Abuse beyond the limits.** Sign-in accepts any password, by the challenge's rules. _(Recommended: a light per-address rate limit on sign-in and on the chat route, kept in memory, enough to stop a script. The per-employee allowance and the daily budget protect the money. Anything stronger belongs to a real identity provider, out of scope.)_
11. **Where the review lives.** _(Recommended: `docs/security.md`. It is a short checklist with the evidence for each item and the date. The README links it. It stays useful for Stage 12 and the interview.)_
