# PRD — Nexo Assist

|         |                                                                                                        |
| ------- | ------------------------------------------------------------------------------------------------------ |
| Status  | Approved (2026-10-27)                                                                                  |
| Version | 0.1 (2026-10-27)                                                                                       |
| Source  | Technical challenge "Nexo Assist, the IT service desk agent" (hiring process PRD) and Pencil prototype |

This document turns the challenge into a product with traceable requirements and splits the delivery into stages. Each stage becomes a GitHub issue and gets its own PRD and tech spec under `docs/stages/` (see section 10).

## 1. Context and problem

Nexo has about 2,000 employees and currently opens IT tickets through a form. The result:

- tickets opened for questions the help center already answers;
- duplicate tickets, tickets with the wrong priority or missing information;
- analysts spending a large part of their day on triage.

## 2. Goal and success metrics

Build **Nexo Assist**, a support agent in a chat. Employees describe the problem in their own words, and the agent looks up their tickets, searches the help center, opens or updates tickets, and calls an analyst when needed.

| Challenge metric               | How the prototype demonstrates it                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| **Resolution without a queue** | Questions answered from the help center, without opening a ticket                       |
| **Well-formed tickets**        | Tickets created only after the draft is confirmed, complete and without duplicates      |
| **Right routing**              | Handoff with a summary in the cases listed in section 5 (R6)                            |
| **Transparency**               | Every reply shows what the agent did, what it understood, how confident it was, and why |

## 3. Personas and user stories

**Nexo employee**, who signs in with their corporate email:

| ID  | Story                                                                                                |
| --- | ---------------------------------------------------------------------------------------------------- |
| F1  | Get an answer to a question without opening a ticket                                                 |
| F2  | Know the status of one of my tickets, even without remembering its number, and whether it is overdue |
| F3  | Add new information to an open ticket                                                                |
| F4  | Open a ticket just by chatting, reviewing the details before it is created                           |
| F5  | Talk to an analyst when I prefer to, or when the problem is serious                                  |
| F6  | Come back another day and pick up where I left off                                                   |

**Service desk analyst** (Tier 1 and Tier 2 support):

| ID  | Story                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------- |
| A1  | Receive tickets with the right type, category and priority, and a description that does not require asking everything again |
| A2  | See the conversations that need me, including those where the agent was not confident enough to decide                      |
| A3  | Take over a conversation with the agent paused, then hand it back to the agent or close it when I am done                   |

## 4. Functional scope

| ID  | Module                   | Summary                                                                                                                                                                             | Prototype screen |
| --- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| M1  | Sign-in                  | Corporate email and password; accepts the sample-data employees with any password                                                                                                   | 1                |
| M2  | Employee chat            | Real-time replies, ticket cards, ticket picker, draft for confirmation, quick-reply options, limit of 30 messages per session                                                       | 2 and 3          |
| M3  | Agent                    | Decides what to do on each message, using the help center and the ticket service, following the rules in section 5                                                                  | —                |
| M4  | Simulated ticket service | Separate from the agent; looks up, creates, updates and transfers tickets; has its own sample data                                                                                  | —                |
| M5  | Handoff to an analyst    | The conversation is marked as waiting for an analyst, and the agent stops replying until it is released                                                                             | 3 and 4          |
| M6  | Analyst console          | Conversation list with filters and status, history, take over (agent paused), hand back, close, panel with the employee's tickets                                                   | 4 and 5          |
| M7  | Decision transparency    | Actions above each reply and an easy-to-read detail: what it understood, which action it took, how confident it was, and why. **This is the most important part of the challenge.** | 2 and 3          |

The prototype (`nexo.pen` and the screenshots) is the visual reference: follow its layout and style, with freedom in the details.

## 5. Service desk rules (Annex A)

| ID  | Rule                                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | **Types:** incident (INC), when something stopped or does not work; request (REQ), for access, equipment or software                                                                                                                       |
| R2  | **Categories:** Access, Network and VPN, Hardware, Software, Email and Other                                                                                                                                                               |
| R3  | **Creation:** every ticket has a title, description, type, category, priority and who is affected. The agent shows a draft and only creates or updates after the employee confirms                                                         |
| R4  | **No duplicates:** if an open ticket already exists for the same problem, it is updated, not duplicated                                                                                                                                    |
| R5  | **Reopening:** tickets resolved up to 7 days ago can be reopened                                                                                                                                                                           |
| R6  | **Handoff:** when the employee asks, in critical cases, for overdue tickets, or when the agent is not confident. It carries a summary, and the agent does not reply while the conversation is with an analyst                              |
| R7  | **Privacy:** ticket information is only shared with the person who opened it                                                                                                                                                               |
| R8  | **Scope:** IT topics only. HR, finance and facilities are redirected                                                                                                                                                                       |
| R9  | **Priority and deadlines:** priority combines impact (how many people are affected) and urgency (whether a commitment is at risk). The deadline applies to the first response and to each update; past the deadline, the ticket is overdue |

| Priority | When to use                                                                | Deadline         |
| -------- | -------------------------------------------------------------------------- | ---------------- |
| Critical | Something is down for a team or for the company                            | 1 hour           |
| High     | Prevents one person from working, or there is a commitment on the same day | 4 business hours |
| Medium   | Gets in the way, but there is a workaround                                 | 3 business days  |
| Low      | Requests and improvements with no urgency                                  | 5 business days  |

The UI keeps the Portuguese names used by Nexo (for example "Rede e VPN", "Alta").

## 6. Non-functional requirements

| ID  | Requirement                                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------- |
| N1  | TypeScript with strict typing                                                                                           |
| N2  | Agent built with Mastra                                                                                                 |
| N3  | Any LLM provider, with the choice explained in the README                                                               |
| N4  | UI follows the prototype, with care for loading and error states                                                        |
| N5  | Ticket service separate from the agent; the legacy system is occasionally unavailable for a few seconds                 |
| N6  | Conversations, tickets and each conversation's state (with the agent or with an analyst) survive an application restart |
| N7  | Runs locally with a few commands documented in the README, and ships an `.env.example`                                  |
| N8  | Clear architecture: UI, agent and services separated, with justified decisions                                          |
| N9  | Organized code, tests where they matter, error handling, and commits that tell the story                                |
| N10 | Fast responses and mindful model usage, considering cost per conversation                                               |
| N11 | Keys kept out of the code; one employee's tickets are never exposed to another                                          |
| N12 | Bonus: deployment with protected keys and usage limits                                                                  |

## 7. Assumptions and product decisions

- **Authentication:** any password works for the sample-data emails, as the challenge requires. Analysts are also part of the sample data and sign in on the same screen.
- **Business hours:** Monday to Friday, 8 a.m. to 6 p.m. Public holidays are out of scope.
- **Message limit:** the messages sent by the employee count toward the limit of 30 per chat session.
- **Simulated LLM mode:** to develop and test with no key and no cost, the agent can use a scripted model instead of the LLM. The real model is set through an environment variable.
- **Illustrative data:** the numbers in the prototype (deadlines, counts) are illustrative. The rules in section 5 prevail.

## 8. Out of scope

- Real authentication (SSO, network password) and password reset.
- Email or push notifications.
- Dedicated mobile screens (the layout must work, but the prototype is desktop).
- Integration with a real ticketing system.

## 9. Stage roadmap

Each stage is an issue. The criteria below are a summary; the details live in the stage's PRD and tech spec.

| #   | Stage                               | Issue                                                        | Covers           | Status |
| --- | ----------------------------------- | ------------------------------------------------------------ | ---------------- | ------ |
| 1   | Hello world                         | [#1](https://github.com/paulojnneto/service-desk/issues/1)   | N2, N3           | Done   |
| 2   | Project skeleton                    | [#2](https://github.com/paulojnneto/service-desk/issues/2)   | N1, N7, N8, N9   | To do  |
| 3   | Sign-in and employee shell          | [#3](https://github.com/paulojnneto/service-desk/issues/3)   | M1, N11          | To do  |
| 4   | Domain and ticket service           | [#4](https://github.com/paulojnneto/service-desk/issues/4)   | M4, R7, R9, N5   | To do  |
| 5   | Conversation persistence            | [#5](https://github.com/paulojnneto/service-desk/issues/5)   | F6, N6           | To do  |
| 6   | Agent and service desk rules        | [#6](https://github.com/paulojnneto/service-desk/issues/6)   | M3, F1–F5, R1–R8 | To do  |
| 7   | Chat cards and flows                | [#7](https://github.com/paulojnneto/service-desk/issues/7)   | M2               | To do  |
| 8   | Decision transparency               | [#8](https://github.com/paulojnneto/service-desk/issues/8)   | M7               | To do  |
| 9   | Handoff and analyst console         | [#9](https://github.com/paulojnneto/service-desk/issues/9)   | M5, M6, A1–A3    | To do  |
| 10  | Decision quality (evals)            | [#10](https://github.com/paulojnneto/service-desk/issues/10) | M3, M7           | To do  |
| 11  | Efficiency, resilience and security | [#11](https://github.com/paulojnneto/service-desk/issues/11) | N5, N10, N11     | To do  |
| 12  | Deployment and final README         | [#12](https://github.com/paulojnneto/service-desk/issues/12) | N3, N7, N12      | To do  |

### Stage 1 — Hello world (done)

- **Goal:** prove the stack end to end before adding any structure.
- **Delivery:** Next.js with a Mastra agent, one sample tool, and a streamed reply with the action line above it.
- **Result:** commit `6c716fb`.

### Stage 2 — Project skeleton

- **Goal:** give the project the structure that separates UI, agent and services, plus the quality tooling.
- **Delivery:** monorepo with the web app, the ticket service, the agent package and a shared package; strict TS, lint, formatting, tests and CI; the prototype theme (colors, fonts, icons); simulated LLM mode.
- **Acceptance criteria:** `pnpm install` and `pnpm dev` start the web app and the service; lint, typecheck, tests and build pass locally and in CI; the chat replies without a key.
- **Expected result:** anyone who clones the repository runs everything with a few commands, without an LLM key.

### Stage 3 — Sign-in and employee shell

- **Goal:** identify the employee, which is the basis for privacy, and build the shell of the screens.
- **Delivery:** Screen 1 (sign-in) faithful to the prototype; secure session; separation between employee and analyst; sidebar, top bar, chat area with composer and counter; My profile screen.
- **Acceptance criteria:** a sample email with any password signs in; an unknown email shows an error; routes and API require a session; each role only reaches its own area.
- **Expected result:** the employee signs in, sees the support shell and chats with the simulated agent.

### Stage 4 — Domain and ticket service

- **Goal:** have correct, tested ticket data and rules before the agent uses them.
- **Delivery:** deadline calculation in business hours; ticket service with lookup, creation, update, reopening and transfer; help center; Annex B sample data; simulated instability; client with timeouts and retries.
- **Acceptance criteria:** tests for deadlines and overdue status; an employee never gets another employee's ticket; the client recovers from short outages and reports when the service stays down.
- **Expected result:** a service that behaves like the legacy system described in the challenge, with its rules guaranteed by tests.

### Stage 5 — Conversation persistence

- **Goal:** make conversations and their state survive a restart.
- **Delivery:** stored conversations and messages, with their state (with the agent, waiting for an analyst, with an analyst, closed); resuming the open conversation; the 30-message limit enforced on the server.
- **Acceptance criteria:** restarting the application loses no conversation or state; coming back another day shows the history.
- **Expected result:** the employee closes the browser, comes back later and continues where they left off.

### Stage 6 — Agent and service desk rules

- **Goal:** the agent chooses the right action on every message, following Annex A.
- **Delivery:** help center and ticket tools; draft with confirmation; duplicate and reopening checks; type, category and priority classification; IT scope; a structured decision on every turn (intent, action, confidence, rationale).
- **Acceptance criteria:** the critical rules (confirmation, privacy, duplicates) are enforced in code, not only in the prompt; every turn produces a decision record.
- **Expected result:** stories F1 to F5 work end to end in the chat.

### Stage 7 — Chat cards and flows

- **Goal:** give the chat the components of Screens 2 and 3.
- **Delivery:** ticket card, ticket picker, draft with Confirm, Edit and Cancel, questions with quick-reply options, and the deadline shown with the priority.
- **Acceptance criteria:** the prototype's "open a ticket" and "check a ticket" flows work in the UI, with loading and error states.
- **Expected result:** Screens 2 and 3 reproduced and working.

### Stage 8 — Decision transparency

- **Goal:** make it easy to see what the agent did and why on every reply.
- **Delivery:** actions above each reply and an expandable detail with what the agent understood, the action, the confidence, the rationale, the tools called and the rules applied; the same record available to the analyst.
- **Acceptance criteria:** any reply can be explained from the UI, without opening logs.
- **Expected result:** a reviewer understands each agent decision in a few seconds.

### Stage 9 — Handoff and analyst console

- **Goal:** bring what needs a person to the analyst, at the right time and with context.
- **Delivery:** handoff with a summary; agent paused on the server; Screens 4 and 5 (list with filters and status, history, take over, hand back, close, the employee's tickets).
- **Acceptance criteria:** with the conversation handed off, the agent does not reply; the analyst takes over, replies, hands back or closes; the employee sees the analyst's messages.
- **Expected result:** stories A1 to A3 and F5 work end to end.

### Stage 10 — Decision quality (evals)

- **Goal:** measure whether the agent decides correctly, instead of assuming it does.
- **Delivery:** a set of reference conversations (question, duplicate, reopening, VPN on Windows 11, out of scope, someone else's ticket, prompt injection, critical case, overdue ticket) run by a script, with the results in the README.
- **Acceptance criteria:** the script runs with one command and shows results per scenario.
- **Expected result:** objective evidence of decision quality for the README and the interview.

### Stage 11 — Efficiency, resilience and security

- **Goal:** fast replies, predictable cost and protection against abuse.
- **Delivery:** final model choice with a cost rationale; lean history and prompt caching; per-user usage limits; privacy and error-handling review.
- **Acceptance criteria:** estimated cost per conversation documented; limits active; no keys in the code.
- **Expected result:** the project is ready to be published without the risk of unexpected cost.

### Stage 12 — Deployment and final README

- **Goal:** let the reviewers test without running the project.
- **Delivery:** published deployment; README with how to run, architecture, how the agent decides, how quality was ensured, trade-offs and next steps.
- **Acceptance criteria:** the link works and the README covers every item the challenge asks for.
- **Expected result:** the final delivery of the challenge.

## 10. Development process per stage

1. **Issue:** the stage has a GitHub issue with the goal, the delivery, the acceptance criteria and the expected result (template in `.github/ISSUE_TEMPLATE/stage.md`).
2. **Stage PRD:** `docs/stages/NN-name/prd.md` details the problem, the requirements and the acceptance criteria. Reviewed and approved before the tech spec.
3. **Stage tech spec:** `docs/stages/NN-name/tech.md` describes the solution: architecture, files, decisions with alternatives, test plan and commit plan. Reviewed and approved before any code.
4. **Implementation:** on a `stage/NN-name` branch, following the tech spec. Deviations go back to the tech spec before they become code.
5. **Validation:** each acceptance criterion is verified and checked off on the issue.
6. **Delivery:** a pull request that closes the issue (`Closes #N`), reviewed and merged into `main`.

## 11. Risks and open questions

- **Public repository:** the challenge material (original PRD and prototype) would be visible to anyone. Decide whether it goes into the repository or is only referenced.
- **Final model:** the choice between a more capable model and a cheaper one is deferred to Stage 11, with cost measurements.
- **Prototype:** the Pencil link was not included in the PRD; the reference is the `nexo.pen` file received.
