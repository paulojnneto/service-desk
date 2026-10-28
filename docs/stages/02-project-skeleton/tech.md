# Stage 02 — Project skeleton: tech spec

|        |                                                                                |
| ------ | ------------------------------------------------------------------------------ |
| Issue  | [#2](https://github.com/paulojnneto/service-desk/issues/2)                     |
| PRD    | [`prd.md`](prd.md), revision 2                                                 |
| Status | Revision 2 — approved on 2026-10-27 (revision 1 approved earlier the same day) |

## Changes in revision 2

Revision 1 kept the UI and the agent together in a Next.js app. Following PRD decision 4, revision 2 replaces it with:

- **`apps/web`:** a client-only Vite + React app.
- **`apps/api` (new):** a Hono backend that runs the agent and exposes the chat route.

Everything else from revision 1 stays: the workspace, the agent package, the simulated model, the ticket service, the shared vocabulary, the theme tokens, the tooling and the CI. Its commits stay in the branch history, and this revision adds new commits on top.

## Solution overview

```
 Browser                       Backend (Node)
┌──────────────────┐  /api   ┌──────────────────────┐        ┌──────────────────────┐
│ apps/web         │ ──────▶ │ apps/api  (port 3001)│ ─uses─▶│ packages/agent       │
│ Vite + React     │ ◀stream─│ Hono: /api/chat,     │        │ Mastra agent, tools, │
│ (port 3000)      │         │ /health              │        │ models               │
└──────────────────┘         └──────────────────────┘        └──────────┬───────────┘
                                        ┆ HTTP, from Stage 4             │ uses
                                        ▼                                ▼
                             ┌──────────────────────┐        ┌──────────────────────┐
                             │ apps/tickets (4000)  │ ─uses─▶│ packages/shared      │
                             │ Hono, legacy system  │        │ Annex A vocabulary   │
                             └──────────────────────┘        └──────────────────────┘
```

- **`apps/web`** is static files plus JavaScript in the browser. It only knows the `/api` path and never sees a key (S-02.15, S-02.16).
- **`apps/api`** is the backend for the UI. In this stage it serves the chat route, with the agent's reply streamed in the AI SDK format that `useChat` consumes, and a health check. Later stages add sign-in, conversations and the analyst console here.
- **`packages/agent`**, **`apps/tickets`** and **`packages/shared`** are unchanged from revision 1.
- **In development**, the Vite dev server forwards `/api` to `localhost:3001`, so the browser sees a single origin. **In production**, the plan is for the API to serve the built UI from the same origin; Stage 12 confirms it.

## Files and modules

| Path                                     | What changes                                                                                                                                                                                             | Why              |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `apps/api/**`                            | New: `createApp()` with `GET /health` and `POST /api/chat`, server entry point, tests, `.env.example`, `package.json`, `tsconfig.json`                                                                   | S-02.15, S-02.16 |
| `apps/web/index.html`, `src/main.tsx`    | New Vite entry point: mounts React and imports the CSS and fonts                                                                                                                                         | S-02.15          |
| `apps/web/src/app.tsx`                   | The hello world chat page, moved from `src/app/page.tsx` with `git mv`                                                                                                                                   | S-02.15          |
| `apps/web/src/index.css`                 | The theme tokens, moved from `src/app/globals.css` with `git mv`; the font variables now point to the Fontsource families                                                                                | S-02.12          |
| `apps/web/vite.config.ts`                | React and Tailwind plugins, port 3000, `/api` proxy to the API                                                                                                                                           | S-02.8, S-02.15  |
| `apps/web/package.json`, `tsconfig.json` | Vite scripts and dependencies; one tsconfig for `src` and `vite.config.ts`                                                                                                                               | S-02.4           |
| `apps/web/public/favicon.ico`            | Moved from `src/app/favicon.ico`                                                                                                                                                                         | —                |
| Removed from `apps/web`                  | `next.config.ts`, `src/app/layout.tsx`, `src/app/api/chat/route.ts` (now in the API), the Next.js `eslint.config.mjs`, `AGENTS.md` (Next.js-only instructions), `.env.example` (the UI has no variables) | S-02.16          |
| `eslint.config.mjs`                      | One config for the whole repository, now on ESLint 10, with React Hooks and React Refresh rules for `apps/web`                                                                                           | S-02.5           |
| `package.json` (root)                    | `dev` also starts `@nexo/api`; ESLint 10                                                                                                                                                                 | S-02.8           |
| `vitest.config.mts`                      | Includes `apps/api` tests                                                                                                                                                                                | S-02.6           |
| `README.md`, `docs/prd.md`               | New structure, ports and the rule about secrets                                                                                                                                                          | S-02.14          |

## Decisions

### New in revision 2

| Decision               | Choice                                                                                                                                     | Alternatives considered                                    | Reason                                                                                                                                                                                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI framework           | Vite 8 + React 19 (`@vitejs/plugin-react`)                                                                                                 | Next.js 16 (revision 1); React Router in framework mode    | PRD decision 4                                                                                                                                                                                                                                                                                                   |
| Agent API              | Our own Hono app calling the agent through `handleChatStream` from `@mastra/ai-sdk`                                                        | Mastra's standalone server (`mastra dev` with `chatRoute`) | The API will also host routes that are not the agent's (sign-in, conversations, analyst console, live updates) behind our own auth middleware and error handling. Same framework as the ticket service, and no extra CLI or build step. The cost is losing Mastra Studio, which can be added later for debugging |
| Dev connectivity       | Vite proxy: `/api` → `http://localhost:3001`                                                                                               | Calling the API on another origin with CORS                | One origin in the browser, so the session cookie in Stage 3 works without CORS or credentials settings, the same way it will in production                                                                                                                                                                       |
| Production serving     | The API serves the built UI (`apps/web/dist`) from the same origin, confirmed in Stage 12                                                  | Two deployments (static host + API)                        | One deployment, one origin, no CORS                                                                                                                                                                                                                                                                              |
| API runner             | `tsx` (`watch` in dev), like the ticket service                                                                                            | Compiling with `tsc`                                       | No build step now; Stage 12 decides how it runs in production                                                                                                                                                                                                                                                    |
| Fonts                  | `@fontsource-variable/schibsted-grotesk` and `@fontsource-variable/newsreader`, imported in `main.tsx`                                     | A Google Fonts `<link>`; copying font files by hand        | Self-hosted through the build: no request to a third party and no layout shift from a late font                                                                                                                                                                                                                  |
| Tailwind integration   | `@tailwindcss/vite` plugin                                                                                                                 | PostCSS setup                                              | The official Tailwind v4 integration for Vite                                                                                                                                                                                                                                                                    |
| Lint                   | One root ESLint 10 config: typescript-eslint everywhere, plus `eslint-plugin-react-hooks` and `eslint-plugin-react-refresh` for `apps/web` | Keeping ESLint 9 and a separate config for the web app     | `eslint-config-next` was the only reason to stay on ESLint 9 and keep a second config. One config is simpler to explain and to keep consistent                                                                                                                                                                   |
| UI typecheck and build | `tsc --noEmit` for types, `vite build` for the bundle                                                                                      | `tsc -b` with project references                           | One tsconfig is enough for one small app                                                                                                                                                                                                                                                                         |
| Ports                  | UI 3000 (`strictPort`), API 3001, tickets 4000                                                                                             | Vite's default 5173                                        | Easy to remember, and `strictPort` fails loudly instead of quietly moving to another port                                                                                                                                                                                                                        |
| Secrets in the UI      | The UI has no `.env` at all; secrets live only in `apps/api/.env.local`                                                                    | A UI `.env` with non-secret settings                       | Vite publishes every `VITE_*` variable to the browser. With no UI variables, there is nothing to leak by mistake                                                                                                                                                                                                 |

### Kept from revision 1

| Decision                  | Choice                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| Repository layout         | pnpm workspace, plain `pnpm -r` / `--parallel`, no Turborepo                                     |
| How packages are consumed | As TypeScript source (`exports: ./src/index.ts`); Vite and tsx compile them directly             |
| Ticket service            | Hono with `@hono/node-server`, run with `tsx`                                                    |
| Tests                     | Vitest, one root config                                                                          |
| Formatting                | Prettier, `printWidth: 100`, `.gitattributes` with LF                                            |
| Simulated model           | Scripted `LanguageModelV4` in `packages/agent/src/models`, `@ai-sdk/provider` pinned to `4.0.29` |
| Model selection           | `NEXO_AGENT_MODEL`: empty or `mock` for the simulated model, otherwise a Mastra model router ID  |
| Theme                     | Tailwind v4 `@theme` with every color variable from `nexo.pen`, default palette reset            |
| Icons                     | `lucide-react`                                                                                   |
| Prototype files           | Git-ignored `docs/prototype/`                                                                    |
| Node version              | `.nvmrc` with `22`, `engines: ">=22.13 <23"`                                                     |
| CI                        | GitHub Actions on Ubuntu with frozen lockfile                                                    |

`transpilePackages` in the Next.js config is no longer needed: Vite compiles workspace TypeScript sources without extra configuration.

## Contracts

**`apps/api`**

| Method | Path        | Request                                                       | Response                                                               |
| ------ | ----------- | ------------------------------------------------------------- | ---------------------------------------------------------------------- |
| GET    | `/health`   | —                                                             | `200 {"status":"ok"}`                                                  |
| POST   | `/api/chat` | AI SDK chat request, as sent by `useChat` (`{ messages, … }`) | `200`, UI message stream (server-sent events) with tool calls and text |
| POST   | `/api/chat` | Body that is not valid JSON                                   | `400 {"error":"invalid_json"}`                                         |

**`@nexo/agent`**, **`@nexo/shared`** and **`apps/tickets`**: unchanged from revision 1.

**Environment variables**

| App     | Variable            | Default | Purpose                                     |
| ------- | ------------------- | ------- | ------------------------------------------- |
| api     | `NEXO_AGENT_MODEL`  | `mock`  | Simulated model or a Mastra model router ID |
| api     | `ANTHROPIC_API_KEY` | empty   | Only needed with an Anthropic model         |
| api     | `PORT`              | `3001`  | Port of the agent API                       |
| tickets | `PORT`              | `4000`  | Port of the ticket service                  |
| web     | —                   | —       | None, on purpose (S-02.16)                  |

## Error handling

| Failure                                      | What happens                                                                                          |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| The API is down while the UI runs            | The proxy answers with an error, and the chat shows its error state ("Não consegui responder agora…") |
| Real model configured without its key        | Same error state in the chat; the API log names the missing variable                                  |
| Invalid JSON sent to `/api/chat`             | `400` with `invalid_json`, without reaching the agent                                                 |
| The script gets a message it does not handle | It answers with the fixed simulated-mode reply                                                        |
| A port is already in use                     | The process exits with an error naming the port (`strictPort` for the UI)                             |
| Unsupported Node version                     | pnpm prints the `engines` warning                                                                     |

## Test plan

| What                                                                                    | Type                                 | Why it is worth testing                                                 |
| --------------------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------- |
| The agent with the simulated model calls `consultarHorario` and answers with its result | Integration (kept from revision 1)   | Agent wiring and the simulated mode                                     |
| The agent answers without tools for an unknown request                                  | Integration (kept)                   | Fallback path                                                           |
| `POST /api/chat` with the simulated model streams the tool call and the reply           | Integration (`app.request`, no port) | Proves the HTTP contract the UI depends on, including the stream format |
| `POST /api/chat` with invalid JSON answers 400                                          | Integration                          | Error path of the contract                                              |
| The API and the ticket service answer their health checks                               | Integration                          | Both services start, and the test harness is ready for later stages     |

There are still no UI tests: the only screen is the hello world page, which Stage 3 replaces.

**Manual validation of the acceptance criteria**

1. From a fresh clone: `pnpm install`, copy `apps/api/.env.example` to `apps/api/.env.local`, then `pnpm dev`. Open `http://localhost:3000`, `http://localhost:3001/health` and `http://localhost:4000/health`.
2. Ask "qual o horário do service desk?" with no key set, and check the action line, the streamed reply and the fonts.
3. Set `NEXO_AGENT_MODEL=anthropic/claude-opus-5-5` in the API without a key, and check that the chat shows the error state and the API log names the missing key.
4. Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build`.
5. Push and check that CI passes on PR #13.
6. Search `apps/web/dist` for `ANTHROPIC` and for key-like values, and check that `apps/web` has no `.env` file or `VITE_` variable.
7. Compare the tokens with `nexo.pen` using the token check script.
8. Run a pnpm command with Node 25 and check for the `engines` warning.
9. Search the code for Portuguese comments.

## Commit plan

Commits 1 to 9 from revision 1 stay in the branch. New commits:

10. `docs(stage-02): revision 2 of the PRD and tech spec (Vite + React, separate API)`
11. `feat(api): agent API with the chat route and a health check`
12. `refactor(web): replace Next.js with Vite + React`
13. `chore: one ESLint 10 config with React rules for the whole repository`
14. `docs: README and product PRD for the new structure`

Then the PR #13 description and the issue #2 text are updated to the new structure.

## Risks

| Risk                                                       | Mitigation                                                                                                                                                                                                |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A key ends up in the UI bundle through a `VITE_*` variable | The UI has no env file at all; acceptance criterion 8 checks the build output                                                                                                                             |
| The Vite proxy buffers the streamed reply                  | Verified manually in step 2 (the text must arrive word by word)                                                                                                                                           |
| The chat route was written for Next.js                     | `handleChatStream` only takes the parsed body and returns a stream, and `createUIMessageStreamResponse` returns a standard `Response` that Hono returns as is; the `/api/chat` integration test proves it |
| The branch history shows Next.js first and Vite later      | It is the real history; PRD decision 4 explains the change, which is a useful talking point                                                                                                               |
| Mastra and AI SDK versions drift                           | Exact versions pinned; typecheck in CI                                                                                                                                                                    |

## Deviations during implementation

Recorded after the fact: the first two were resolved in code first and only then written here, which goes against step 4 of the process. The third is an extra check, not a change.

| Deviation                                                                                | Why                                                                                                                                                             |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/env.ts` loads `apps/api/.env.local` with Node's `process.loadEnvFile`      | `tsx` does not load env files, and the agent picks its model when it is imported, so the variables must be loaded by the first import of the server entry point |
| Commits 12 and 13 became one commit (`refactor(web): replace Next.js with Vite + React`) | With the old config, `apps/web` was ignored by the root lint config and `pnpm lint` failed; merging keeps every commit passing lint                             |
| The Vite proxy was also checked with a timing script, besides the visual check in step 2 | 18 text deltas spread over about 0.5 s, the same as calling the API directly, so the proxy does not buffer the stream                                           |
