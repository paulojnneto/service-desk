# Nexo Assist

Support agent for Nexo's IT service desk (technical challenge).

> Current state: **domain and ticket service** (Stage 4). Employees sign in and chat with the agent (simulated model, no LLM key needed); the ticket service stores tickets and help center articles in PostgreSQL. The agent starts using it in Stage 6.
> Product requirements and the stage roadmap: [docs/prd.md](docs/prd.md).

## How to run

Requirements: Node 22 (see `.nvmrc`), pnpm 10 (`corepack enable` installs the version set in `package.json`) and Docker (for PostgreSQL).

```bash
pnpm install
pnpm bootstrap     # creates the .env.local files and the service token keys
pnpm db:up         # starts PostgreSQL in Docker (host port 55432)
pnpm db:migrate    # creates the tables
pnpm db:seed       # loads the Annex B sample tickets and articles
pnpm dev
```

`pnpm bootstrap` is not `pnpm setup`: that one is a built-in pnpm command that changes your user environment.

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
| `pnpm db:down`   | Stops PostgreSQL (the data stays in the volume)  |
| `pnpm db:seed`   | Resets the sample data                           |

## Architecture

```
apps/web (browser) ──/api, cookie──▶ apps/api ──▶ packages/agent ──▶ packages/shared
                                        │
                                        │ packages/tickets-client
                                        │ HTTP + JWT (ES256), used by the agent from Stage 6
                                        ▼
                                  apps/tickets ──▶ PostgreSQL (nexo_tickets)
```

| Folder                    | What it is                                                                     |
| ------------------------- | ------------------------------------------------------------------------------ |
| `apps/web`                | Client-only UI (Vite + React). In development, Vite forwards `/api` to the API |
| `apps/api`                | Backend for the UI (Hono): runs the agent and streams its replies              |
| `apps/tickets`            | Simulated ticket service (Hono), a separate process from the agent             |
| `packages/agent`          | Mastra agent: instructions, tools and model selection                          |
| `packages/shared`         | Service desk vocabulary, ticket contracts and business-hours deadlines         |
| `packages/tickets-client` | Client for the ticket service: signed tokens, retries and typed errors         |
| `docs`                    | Product PRD, and the PRD and tech spec of each stage                           |

**Secrets live only in `apps/api/.env.local`.** The UI has no environment variables on purpose: Vite publishes every `VITE_*` variable to the browser.

## Sign-in and sessions

- `POST /api/auth/sign-in` looks the email up in the sample directory (any password works, as the challenge asks) and sets the `nexo_session` cookie: HTTP-only, `SameSite=Lax`, holding only the person's id and role, sealed (encrypted and signed) with `iron-session`. It lasts 10 hours, or 30 days with "Manter conectado".
- The API reads the person only from that cookie, never from the request body. The chat route answers 401 without a session and 403 to analysts, and builds the agent's parameters itself: only the messages come from the client.
- Every `POST` must be JSON, which, together with `SameSite=Lax`, protects against cross-site requests.
- In the UI, each route asks `GET /api/auth/me` before rendering and sends each person to their own area. This only shapes the screens; the API is what protects the data.
- `SESSION_SECRET` (32+ characters) seals the cookie. It is required in production; in development a fixed secret is used when it is missing.

## Ticket service

The simulated legacy system (`apps/tickets`), with its own PostgreSQL database (`nexo_tickets`; `nexo_api` is created for Stage 5).

- **Only the API can call it.** Every request carries a JWT signed by the API with ES256: the requester is the token's `sub`, with issuer `nexo-api`, audience `nexo-tickets` and 60 seconds of life. The service checks all of it with the public key; it holds no private key, so it cannot create tokens. `pnpm bootstrap` writes the private key only to `apps/api/.env.local` and the public key only to `apps/tickets/.env.local`.
- **Privacy:** every query filters by the requester; someone else's ticket answers `404`, like a ticket that does not exist.
- **Deadlines** (Annex A, R9) are computed in São Paulo business hours (Monday to Friday, 8:00 to 18:00): critical 1 hour, high 4 business hours, medium 3 and low 5 business days, counted from the last update. Resolved tickets are never overdue; they can be reopened for 7 calendar days.
- **Idempotent writes:** every `POST` needs an `Idempotency-Key`; a repeat replays the first response, so a retry never creates two tickets.
- **Legacy behavior:** requests may take up to 600 ms, and 5 % of them start a 3-second outage in which everything answers `503`. Tune or turn it off with `LEGACY_LATENCY_MS`, `LEGACY_OUTAGE_RATE` and `LEGACY_OUTAGE_SECONDS` in `apps/tickets/.env.local`. The client retries up to 5 times (waits of 0.25, 0.5, 1 and 2 s), which covers an outage.
- **Tests need no Docker:** they run the same migrations on PGlite, an in-process PostgreSQL.

## Model

The model is set by `NEXO_AGENT_MODEL` in `apps/api/.env.local`:

- `mock` or empty (default): the simulated model in `packages/agent/src/models`. A script decides whether to call a tool or answer, and Mastra runs the tools for real. It is used to build the screens and to run the tests with no key and no cost.
- A Mastra model router ID, such as `anthropic/claude-opus-5-5` or `anthropic/claude-haiku-5-5`, together with its key (for example `ANTHROPIC_API_KEY`).

The final model choice and its cost rationale come in Stage 11.

## Prototype

The prototype from the hiring process (`nexo.pen` and screenshots) is not versioned, because this repository is public. To use it locally, put the files in `docs/prototype/`, which is git-ignored. The colors and fonts derived from it live in `apps/web/src/index.css`.

## How we work

Each stage of the [roadmap](docs/prd.md#9-stage-roadmap) has a GitHub issue, a PRD and a tech spec in `docs/stages/`, and is delivered through a pull request that closes its issue.
