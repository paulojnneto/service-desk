# Stage 10 — Decision quality (evals): PRD

|        |                                                              |
| ------ | ------------------------------------------------------------ |
| Issue  | [#10](https://github.com/paulojnneto/service-desk/issues/10) |
| Status | Approved on 2026-10-29                                       |
| Covers | M3, M7, R1–R9, N9                                            |

## Problem

The README must say how the quality of the agent's decisions was ensured, and today the only answer is "we tried it":

- **The tests prove the code, not the decisions.** The flow tests run the scripted model, which was written to follow the rules. They show that tools, drafts, privacy and handoff are enforced, but say nothing about whether a real model chooses well.
- **Real-model checks were anecdotes.** Stages 6 to 9 ran GPT-5.5 by hand, a few turns each, and found real problems (a handoff without a "yes", a reopening refused without the tool, R8 cited for no reason). Nothing repeats those runs, so a fix to the instructions cannot show that it helped, or that it broke something else.
- **No number to show.** There is no pass rate per scenario, per model or over time for the README and the interview.
- **Failures are hard to read.** When a manual run goes wrong, finding which decision failed means reading the conversation and the stored record by hand.

## Goal

At the end of this stage, one command runs a fixed set of reference conversations through the real application and scores every decision against what Annex A expects. Results are shown per scenario, and each failure points to the turn, the expected decision and the record of what the agent decided. The same set runs with the simulated model, for free in CI, and with a real model on demand. The latest real-model results are in the README.

## Requirements

| ID      | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Source             |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| S-10.1  | **Reference scenarios:** at least the nine of the product PRD (question, duplicate, reopening, VPN on Windows 11, out of scope, someone else's ticket, prompt injection, critical case, overdue ticket), plus the cases earlier stages found fragile: a reopening within the window, a status question without a number, a request still unclear after a question, and the agent after an analyst hands back. Each is a short conversation with the employee's messages, written in Portuguese as an employee would write | Product PRD §9, M3 |
| S-10.2  | **The real application runs them:** each scenario goes through the chat route in process, with the real agent, tools, ticket service, drafts, handoff and decision record, starting from the Annex B sample data. No database or service has to be running, and nothing touches the development data                                                                                                                                                                                                                      | M3, N9             |
| S-10.3  | **One command:** `pnpm eval` runs every scenario; it can also run a subset by name. It uses the simulated model unless a model is given explicitly, so it never spends money by accident                                                                                                                                                                                                                                                                                                                                  | N7, N10            |
| S-10.4  | **Checks on decisions, not on wording:** each turn states what must and must not happen, read from the stored decision record and from the application's state: intent, action, confidence where it matters, tools called or not called, rules enforced, drafts and their fields (type, category, priority), handoff and its reason, tickets written or not. Text is checked only where the rule is about text (the article named, the channel given, no data from another person)                                        | M7, R1–R9          |
| S-10.5  | **More than one right answer:** where Annex A allows several correct decisions, a check accepts any of them, so a model is not failed for a choice the rules allow                                                                                                                                                                                                                                                                                                                                                        | M3                 |
| S-10.6  | **Results per scenario:** the output lists every scenario with passed or failed, and the number of checks passed                                                                                                                                                                                                                                                                                                                                                                                                          | Issue #10          |
| S-10.7  | **Failures point to the decision:** a failed check shows the turn, what was expected, what happened, and that turn's decision record (intent, action, confidence, rationale, tools, rules) with the reply's text, so the reason can be read without opening the database                                                                                                                                                                                                                                                  | Issue #10, M7      |
| S-10.8  | **Repeatable:** a real model is not deterministic, so a run can repeat each scenario several times and report a pass rate per scenario                                                                                                                                                                                                                                                                                                                                                                                    | M3                 |
| S-10.9  | **Saved results:** each real-model run writes a Markdown report (model, date, pass rates, failures with their records) to `docs/evals/`, and the README shows the latest numbers with a link to the report                                                                                                                                                                                                                                                                                                                | Issue #10, N8      |
| S-10.10 | **Cost and time, recorded:** each scenario records its model calls, tokens and duration, as a basis for the cost decisions of Stage 11                                                                                                                                                                                                                                                                                                                                                                                    | N10                |
| S-10.11 | **In CI:** the simulated run is part of CI, so a change that breaks the rules in code, the tools or the scenarios fails the pipeline                                                                                                                                                                                                                                                                                                                                                                                      | N9                 |
| S-10.12 | **A first real-model result:** the set runs with the reference model (GPT-5.5), its failures are analysed in the report, and where a fix in the instructions or tool descriptions is cheap, it is made and the set runs again, with both results kept                                                                                                                                                                                                                                                                     | M3, M7             |
| S-10.13 | The README's "How quality was ensured" explains what the evals check, what the simulated run proves and what it does not, how to run them, and the latest results                                                                                                                                                                                                                                                                                                                                                         | N8, Issue #10      |

## Acceptance criteria

- [ ] `pnpm eval` runs every scenario with the simulated model, with no database running, and prints passed or failed per scenario.
- [ ] `pnpm eval --scenario reabertura` runs only the matching scenarios.
- [ ] Breaking a rule on purpose (for example, letting the creation draft skip the duplicate check) makes the matching scenario fail, and the output names the turn, the expected decision, the actual one and its record.
- [ ] A real model runs only when given explicitly (`--model openai/gpt-5.5`), after the run says how many scenarios and turns it will play.
- [ ] With `--repeat 3`, each scenario reports a pass rate.
- [ ] A real-model run writes a report to `docs/evals/` with the model, the date, pass rates, tokens, duration and every failure with its record.
- [ ] The simulated run passes in CI.
- [ ] The README shows the latest GPT-5.5 results and explains how to read them; the first real-model run is done after asking, since it costs.
- [ ] Lint, typecheck, tests, build and CI pass.

## Out of scope

- Monitoring decisions in production, or scoring real conversations.
- An LLM judging the replies' tone or helpfulness.
- Choosing the final model and comparing costs across providers (Stage 11). This stage records tokens and time; Stage 11 decides.
- The analyst's decisions. The evals score the agent; the console is covered by the Stage 9 tests.
- Load or latency targets.

## Dependencies

- Stages 6 to 9: the tools, the rules in code, the decision record with enforced rules (Stage 8) and the handoff and hand back (Stage 9).
- Stage 4: the ticket service and the Annex B sample data, which the scenarios start from.
- The test app in `apps/api` (in-process database and ticket service), which the runner reuses.
- An `OPENAI_API_KEY` in `apps/api/.env.local` for the real-model runs, used only after asking.

## Decisions

Resolved on 2026-10-29, all following the recommendation: the scenarios run through the API in process, with PGlite and the ticket service in process, reset per scenario; decisions are scored by deterministic checks on the decision record and the application's state, with no LLM judge; each turn has "must" and "must not" checks that may accept several answers; the README says plainly that the simulated run proves the harness and the rules in code, and that decision quality is the real-model result; GPT-5.5 is the reference real model, with one repetition for the committed result and `--repeat` when needed; expected decisions follow Stages 6 to 9; the employee's turns are scripted messages and option picks; each real-model run is a committed Markdown report in `docs/evals/`, with the latest numbers in the README; a real-model failure does not block the stage, and a cheap fix in the instructions is followed by a second run with both reports kept; tokens and time are recorded per scenario.

## Open questions (resolved)

1. **Where the scenarios run.** They could call the Mastra agent directly, drive the running development servers, or run the API in process. _(Recommended: the API in process, as the flow tests do: the chat route, an in-memory PostgreSQL (PGlite) and the ticket service in process, reset for every scenario. Every rule in code takes part, the decision record is the real one, nothing needs Docker, and the developer's data is never touched. Calling the agent alone would skip the route, the drafts and the handoff.)_
2. **How decisions are scored.** _(Recommended: deterministic checks on the decision record and the application's state, and no LLM judge. The rules of Annex A are about what was done, not how it was said, so they can be checked exactly. A judge would add cost, its own errors and results that change between runs. Text is checked only where a rule is about text.)_
3. **How strict a check is.** _(Recommended: each turn has "must" and "must not" checks, and a check may list the answers it accepts. For example, the critical case must hand off as `caso_critico`, may also prepare a Crítica draft, and must not create a ticket. The scenario file says why each expectation follows from Annex A.)_
4. **What the simulated run proves.** The scripted model was written to pass. _(Recommended: the README says so plainly. The simulated run proves the harness, the rules in code and that the scenarios are consistent, and it runs in CI. Decision quality is the real-model result, which is the number in the README.)_
5. **Which real model, how many times.** _(Recommended: GPT-5.5, the reference model since Stage 6. The committed result uses one repetition, about 13 scenarios and 30 turns. `--repeat 3` exists for when a scenario looks flaky. The run prints the number of turns and asks for no confirmation itself; the confirmation is the explicit `--model`. Stage 11 compares other models.)_
6. **Expected decisions that Annex A leaves open.** _(Recommended: the scenarios follow the decisions already made in Stages 6 to 9:_
   - _a critical case hands off directly (Stage 9);_
   - _an overdue ticket offers an analyst first;_
   - _a duplicate becomes an update draft (Stage 6);_
   - _someone else's ticket reads as not found;_
   - _out of scope redirects with no tool that writes;_
   - _the VPN error 809 on Windows 11 ends in an Incidente, Rede e VPN draft, with priority from the answers._

   _Each scenario cites the decision it relies on.)_

7. **Multi-turn answers.** Several scenarios need the employee's answers (Windows 11, who is affected). _(Recommended: scripted employee messages, not a simulated employee. A turn can also pick an option from the agent's last question by its text, as the UI does. It stays deterministic on the employee's side, so only the agent varies.)_
8. **Where results live.** _(Recommended: one Markdown report per real-model run in `docs/evals/` (`2026-10-29-gpt-5.5.md`), committed. The README has a short table with the latest numbers and a link. Simulated runs only print to the console and fail CI on a regression; they are not saved.)_
9. **What happens when the real model fails a scenario.** _(Recommended: a failure does not block the stage, because the stage measures. The report explains each failure. When the cause is cheap to fix in the instructions or a tool description, it is fixed and the set runs again, and both reports are kept so the before and after show. A fix that needs a new rule in code becomes a follow-up.)_
10. **Tokens and time.** _(Recommended: record them now, per scenario, from the model's usage. They cost nothing to keep and give Stage 11 real numbers for the cost estimate. No budget or alert in this stage.)_
