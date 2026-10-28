# Nexo Assist

Support agent for Nexo's IT service desk (technical challenge).

> Current state: **project skeleton** (Stage 2). The agent streams its replies in the chat, using a simulated model that needs no LLM key.
> Product requirements and the stage roadmap: [docs/prd.md](docs/prd.md).

## How to run

Requirements: Node 22 (see `.nvmrc`) and pnpm 10. `corepack enable` installs the pnpm version set in `package.json`.

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
pnpm dev
```

- Chat: http://localhost:3000. Ask, for example, "qual o horário do service desk?". The line above the reply shows the tool the agent called.
- Ticket service: http://localhost:4000/health

If your machine uses another Node version globally (for example with nvm-windows), switch before installing: `nvm use 22`.

### Other commands

| Command          | What it does                                     |
| ---------------- | ------------------------------------------------ |
| `pnpm test`      | Runs the tests of every package                  |
| `pnpm lint`      | Lints every package                              |
| `pnpm typecheck` | Type-checks every package                        |
| `pnpm build`     | Builds the web app                               |
| `pnpm format`    | Formats the repository (`format:check` verifies) |

## Structure

| Folder            | What it is                                                               |
| ----------------- | ------------------------------------------------------------------------ |
| `apps/web`        | Next.js: screens and API routes                                          |
| `apps/tickets`    | Simulated ticket service (Hono), a separate process from the agent       |
| `packages/agent`  | Mastra agent: instructions, tools and model selection                    |
| `packages/shared` | Service desk vocabulary: ticket types, categories, priorities, deadlines |
| `docs`            | Product PRD, and the PRD and tech spec of each stage                     |

The UI uses the agent only through `@nexo/agent`, and the agent will reach the ticket service over HTTP (Stage 4).

## Model

The model is set by `NEXO_AGENT_MODEL` in `apps/web/.env.local`:

- `mock` or empty (default): the simulated model in `packages/agent/src/models`. A script decides whether to call a tool or answer, and Mastra runs the tools for real. It is used to build the screens and to run the tests with no key and no cost.
- A Mastra model router ID, such as `anthropic/claude-opus-5-5` or `anthropic/claude-haiku-5-5`, together with its key (for example `ANTHROPIC_API_KEY`).

The final model choice and its cost rationale come in Stage 11.

## Prototype

The prototype from the hiring process (`nexo.pen` and screenshots) is not versioned, because this repository is public. To use it locally, put the files in `docs/prototype/`, which is git-ignored. The colors and fonts derived from it live in `apps/web/src/app/globals.css`.

## How we work

Each stage of the [roadmap](docs/prd.md#9-stage-roadmap) has a GitHub issue, a PRD and a tech spec in `docs/stages/`, and is delivered through a pull request that closes its issue.
