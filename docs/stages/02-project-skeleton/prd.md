# Stage 02 — Project skeleton: PRD

| | |
| --- | --- |
| Issue | [#2](https://github.com/paulojnneto/service-desk/issues/2) |
| Status | Approved (2026-10-27) |
| Covers | N1, N4, N7, N8, N9 (product PRD, section 6) |

## Problem

The hello world proved the stack, but it is a single Next.js app with the agent living inside the UI code. That leaves four gaps against the challenge:

- **No separation (N8).** UI, agent and services are not separated, and the ticket service, which the challenge requires to be separate from the agent (M4, N5), has nowhere to live.
- **No quality safety net (N9).** There are no automated tests, no formatting standard and no CI. Every later stage would add code without a check that it still works.
- **It cannot run without an LLM key (N7).** Anyone who clones the repository, including us while building the screens, needs a paid key just to see the chat reply.
- **No visual foundation (N4).** The prototype's colors and fonts are not in the project, so every screen would hard-code its own values.

## Goal

At the end of this stage, the repository has the structure that the rest of the roadmap builds on: separate parts for the UI, the agent, the ticket service and the shared domain vocabulary; quality checks that run locally and on every push; the prototype's visual foundation; and a way to run the whole project without an LLM key.

## Requirements

| ID | Requirement | Source |
| --- | --- | --- |
| S-02.1 | The UI, the agent, the ticket service and the shared domain vocabulary live in separate parts of the repository, each with a clear responsibility | N8 |
| S-02.2 | The ticket service runs as its own process, apart from the web app and the agent | M4, N5 |
| S-02.3 | The agent does not depend on the UI; the UI uses the agent only through its public entry point | N8 |
| S-02.4 | Strict TypeScript is shared by every part, including checks against unsafe indexed access | N1 |
| S-02.5 | One lint and one formatting standard apply to the whole repository, with normalized line endings | N9 |
| S-02.6 | One test command runs the tests of every part | N9 |
| S-02.7 | Continuous integration runs the format check, lint, typecheck, tests and build on every push and pull request | N9 |
| S-02.8 | One command starts the web app and the ticket service for development, and each app documents its variables in an `.env.example` | N7 |
| S-02.9 | The Node version is pinned and a wrong version is reported | N7 |
| S-02.10 | The agent can run with a simulated model that needs no key and has no cost; the real model is chosen through an environment variable, with no code change | N7, N10 |
| S-02.11 | With the simulated model, the agent still calls its tools for real; only the decision comes from a script | N9 |
| S-02.12 | The prototype's colors, fonts and icons are available to the UI as reusable design tokens | N4 |
| S-02.13 | Code comments are in English, including the ones carried over from the hello world | Product decision (2026-10-27) |
| S-02.14 | The README explains how to install, configure and run the project, and how to switch between the simulated and the real model | N7 |

## Acceptance criteria

- [ ] After cloning, `pnpm install` and `pnpm dev` start the web app on port 3000 and the ticket service on port 4000.
- [ ] The ticket service answers a health check at `http://localhost:4000/health`.
- [ ] With the simulated model, asking "qual o horário do service desk?" in the chat calls the hours tool and replies with the hours, without any key set.
- [ ] Setting the model variable to a real model makes the agent use it, with no code change.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass locally.
- [ ] CI runs the same checks on the stage pull request and passes.
- [ ] An automated test runs the agent end to end with the simulated model (the tool is called and the reply uses its result).
- [ ] The color tokens in the UI match the `variables` in `nexo.pen`, and the UI uses the prototype fonts.
- [ ] Running a command with an unsupported Node version shows a warning.
- [ ] No code comment is in Portuguese.

## Out of scope

- Screens beyond the existing chat page: sign-in, shell and profile (Stage 3).
- Ticket data, ticket endpoints and the help center (Stage 4).
- Persistence of any kind (Stage 5).
- Service desk rules in the agent (Stage 6).

## Dependencies

- Stage 1 (hello world, [#1](https://github.com/paulojnneto/service-desk/issues/1)).

## Decisions

Resolved on 2026-10-27, all following the recommendation:

1. **Prototype files:** not versioned. They stay in a local, git-ignored `docs/prototype/` folder; only the derived design tokens go into the code.
2. **Default model:** the simulated model, when no model is configured.
3. **Simulated model scope:** only the hours question and a generic fallback in this stage.

## Open questions (resolved)

1. **Prototype in a public repository.** The repository is public, and the prototype (`nexo.pen` and the screenshots) is material from the hiring process. Options:
   - **(a)** Keep the repository public and do not version the prototype files: they stay in a local, git-ignored `docs/prototype/` folder, and only the design tokens derived from them go into the code. *(Recommended: the reviewers already have the prototype, and nothing of theirs becomes public beyond the colors and fonts that any deployed UI exposes anyway.)*
   - **(b)** Make the repository private and grant the reviewers access, versioning the prototype with the code.
   - **(c)** Keep the repository public and version the prototype.
2. **Default model.** When no model is configured, should the project use the simulated model? *(Recommended: yes, so that cloning and running works with no key. The real model is opt-in through the environment variable, and the README says so.)*
3. **Simulated model scope.** In this stage the script only covers the hours question and a generic fallback reply. *(Recommended: keep it that small now; each later stage extends the script with the flows it introduces.)*
