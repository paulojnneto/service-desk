# Nexo Assist

Support agent for Nexo's IT service desk (technical challenge).

> Current state: **sign-in and employee shell** (Stage 3). Employees sign in and chat with the agent, which uses a simulated model that needs no LLM key.
> Product requirements and the stage roadmap: [docs/prd.md](docs/prd.md).

## How to run

Requirements: Node 22 (see `.nvmrc`) and pnpm 10. `corepack enable` installs the pnpm version set in `package.json`.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env.local
pnpm dev
```

`pnpm dev` starts three processes:

| Process        | URL                          | What it is                     |
| -------------- | ---------------------------- | ------------------------------ |
| UI             | http://localhost:3000        | The chat (Vite + React)        |
| Agent API      | http://localhost:3001/health | Backend that runs the agent    |
| Ticket service | http://localhost:4000/health | Simulated legacy ticket system |

Open http://localhost:3000 and sign in with a sample email and **any password**:

| Who                   | Email                     | Lands on                         |
| --------------------- | ------------------------- | -------------------------------- |
| Employee (Ana Souza)  | `ana.souza@nexo.com.br`   | The support chat                 |
| Analyst (Rafael Lima) | `rafael.lima@nexo.com.br` | The analyst area (console later) |

The other sample people are in `packages/shared/src/directory.ts`. In the chat, ask for example "qual o horário do service desk?". The line above the reply shows the tool the agent called.

If your machine uses another Node version globally (for example with nvm-windows), switch before installing: `nvm use 22`.

### Other commands

| Command          | What it does                                     |
| ---------------- | ------------------------------------------------ |
| `pnpm test`      | Runs the tests of every package                  |
| `pnpm lint`      | Lints every package                              |
| `pnpm typecheck` | Type-checks every package                        |
| `pnpm build`     | Builds the UI into `apps/web/dist`               |
| `pnpm format`    | Formats the repository (`format:check` verifies) |

## Architecture

```
apps/web (browser) ──/api──▶ apps/api ──▶ packages/agent ──▶ packages/shared
                                 ┆
                                 ┆ HTTP, from Stage 4
                                 ▼
                           apps/tickets ──▶ packages/shared
```

| Folder            | What it is                                                                     |
| ----------------- | ------------------------------------------------------------------------------ |
| `apps/web`        | Client-only UI (Vite + React). In development, Vite forwards `/api` to the API |
| `apps/api`        | Backend for the UI (Hono): runs the agent and streams its replies              |
| `apps/tickets`    | Simulated ticket service (Hono), a separate process from the agent             |
| `packages/agent`  | Mastra agent: instructions, tools and model selection                          |
| `packages/shared` | Service desk vocabulary: ticket types, categories, priorities, deadlines       |
| `docs`            | Product PRD, and the PRD and tech spec of each stage                           |

**Secrets live only in `apps/api/.env.local`.** The UI has no environment variables on purpose: Vite publishes every `VITE_*` variable to the browser.

## Sign-in and sessions

- `POST /api/auth/sign-in` looks the email up in the sample directory (any password works, as the challenge asks) and sets the `nexo_session` cookie: HTTP-only, `SameSite=Lax`, holding only the person's id and role, sealed (encrypted and signed) with `iron-session`. It lasts 10 hours, or 30 days with "Manter conectado".
- The API reads the person only from that cookie, never from the request body. The chat route answers 401 without a session and 403 to analysts, and builds the agent's parameters itself: only the messages come from the client.
- Every `POST` must be JSON, which, together with `SameSite=Lax`, protects against cross-site requests.
- In the UI, each route asks `GET /api/auth/me` before rendering and sends each person to their own area. This only shapes the screens; the API is what protects the data.
- `SESSION_SECRET` (32+ characters) seals the cookie. It is required in production; in development a fixed secret is used when it is missing.

## Model

The model is set by `NEXO_AGENT_MODEL` in `apps/api/.env.local`:

- `mock` or empty (default): the simulated model in `packages/agent/src/models`. A script decides whether to call a tool or answer, and Mastra runs the tools for real. It is used to build the screens and to run the tests with no key and no cost.
- A Mastra model router ID, such as `anthropic/claude-opus-5-5` or `anthropic/claude-haiku-5-5`, together with its key (for example `ANTHROPIC_API_KEY`).

The final model choice and its cost rationale come in Stage 11.

## Prototype

The prototype from the hiring process (`nexo.pen` and screenshots) is not versioned, because this repository is public. To use it locally, put the files in `docs/prototype/`, which is git-ignored. The colors and fonts derived from it live in `apps/web/src/index.css`.

## How we work

Each stage of the [roadmap](docs/prd.md#9-stage-roadmap) has a GitHub issue, a PRD and a tech spec in `docs/stages/`, and is delivered through a pull request that closes its issue.
