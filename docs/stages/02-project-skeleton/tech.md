# Stage 02 — Project skeleton: tech spec

| | |
| --- | --- |
| Issue | [#2](https://github.com/paulojnneto/service-desk/issues/2) |
| PRD | [`prd.md`](prd.md) (approved on 2026-10-27) |
| Status | Approved (2026-10-27) |

## Solution overview

The repository becomes a **pnpm workspace** with four packages. Each one owns one responsibility from the PRD, and the dependency arrows only point one way:

```
apps/web  ──uses──▶  packages/agent  ──uses──▶  packages/shared
 (Next.js UI          (Mastra agent,              (domain vocabulary:
  and API routes)      tools, models)              types, categories,
                                                   priorities, deadlines)
                            ┆
                            ┆ HTTP, from Stage 4
                            ▼
                      apps/tickets  ──uses──▶  packages/shared
                      (ticket service,
                       its own process)
```

- **`apps/web`** keeps the hello world page and route, moved as they are. It talks to the agent only through `@nexo/agent` (S-02.3).
- **`packages/agent`** holds the Mastra instance, the agent, its tools and the model selection, including the simulated model (S-02.10, S-02.11).
- **`apps/tickets`** is a separate HTTP service. In this stage it only answers a health check, which is enough to prove the separate process (S-02.2) and give Stage 4 a tested starting point.
- **`packages/shared`** holds the Annex A vocabulary (ticket types, categories, priorities and the deadline table) as zod schemas, so that the agent and the ticket service use the same definitions.

Quality tooling lives at the root and applies to every package: shared strict TypeScript, ESLint, Prettier, Vitest and a GitHub Actions workflow (S-02.4 to S-02.7).

**Reference implementation.** The local branch `local/etapa-esqueleto` has an earlier, unreviewed version of this stage. It is reused file by file only where it matches this spec, and every reused file is reviewed against it.

## Files and modules

| Path | What changes | Why |
| --- | --- | --- |
| `package.json` | Becomes the workspace root: `dev`, `build`, `lint`, `typecheck`, `test`, `format` scripts; shared dev tooling | S-02.6, S-02.8 |
| `pnpm-workspace.yaml` | Declares `apps/*` and `packages/*` | S-02.1 |
| `tsconfig.base.json` | Strict config shared by every package | S-02.4 |
| `eslint.config.mjs` | typescript-eslint rules for the non-Next packages | S-02.5 |
| `.prettierrc.json`, `.prettierignore` | Formatting standard | S-02.5 |
| `.gitattributes` | LF line endings for text, binary for images | S-02.5 |
| `.gitignore` | Unanchored patterns (`node_modules/`, `.next/`) so they cover every package; ignores `docs/prototype/` | S-02.1, PRD decision 1 |
| `vitest.config.mts` | One test run across packages | S-02.6 |
| `.github/workflows/ci.yml` | Format check, lint, typecheck, test and build | S-02.7 |
| `.nvmrc`, `engines` | Node 22 pinned | S-02.9 |
| `apps/web/**` | Hello world app moved here with `git mv`; `package.json`, `tsconfig.json` extending the base, `next.config.ts` with `transpilePackages`, `.env.example` | S-02.1, S-02.8 |
| `apps/web/src/app/globals.css` | Theme tokens mirroring `nexo.pen` | S-02.12 |
| `apps/web/src/app/layout.tsx` | Prototype fonts | S-02.12 |
| `apps/web/src/app/api/chat/route.ts` | Imports the agent from `@nexo/agent` | S-02.3 |
| `apps/tickets/**` | Hono app (`createApp`), server entry point, health test, `.env.example` | S-02.2 |
| `packages/agent/src/**` | Mastra instance, agent and tool moved from `src/mastra`; `models/` with the model selection, the scripted model and its script; end-to-end test | S-02.10, S-02.11 |
| `packages/shared/src/**` | Annex A vocabulary | S-02.1 |
| `README.md` | Install, configure, run, structure, switching models | S-02.14 |

## Decisions

| Decision | Choice | Alternatives considered | Reason |
| --- | --- | --- | --- |
| Repository layout | pnpm workspace (monorepo) | Single Next.js app with folders; separate repositories | Package boundaries are enforced by each package's `exports`, not by convention, and there is still one install and one CI. Separate repositories would make the reviewers' setup harder |
| Task runner | Plain `pnpm -r` / `--parallel` | Turborepo, Nx | Four packages do not need build caching or a task graph; one less tool to explain |
| How packages are consumed | As TypeScript source (`exports: ./src/index.ts`), with `transpilePackages` in Next.js | Building each package to `dist` | No build step or watch process per package. Every consumer (Next.js, tsx, Vitest) already compiles TypeScript |
| Ticket service framework | Hono with `@hono/node-server` | Express, Fastify, Next.js route handlers | Small, typed and based on the Fetch API. `app.request()` lets tests call it without opening a port. Route handlers inside the web app would break the required separation |
| Ticket service runner | `tsx` (`watch` in dev) | Compiling with `tsc` and running `node dist` | No build step now; how it runs in production is decided in Stage 12 |
| Test runner | Vitest, one root config | Jest | Native TypeScript and ESM support, no transform setup |
| Lint | ESLint 9 flat config: Next.js rules in `apps/web`, typescript-eslint recommended at the root for the others | ESLint 10; Biome | `eslint-config-next` 16.4 targets ESLint 9. Biome would not run the Next.js rules |
| Formatting | Prettier, `printWidth: 100` | Biome | Standard choice that every editor supports |
| Simulated model | A scripted `LanguageModelV4` implemented in `packages/agent/src/models` | `MockLanguageModelV4` from `ai/test`; mocking Mastra; record and replay | Mastra treats it as a real model, so tools run for real (S-02.11). It is production code, not a test utility, and it controls the streaming (text arrives word by word, like a real model) |
| Provider types | `@ai-sdk/provider` pinned to `4.0.29`, the version Mastra uses internally | Latest version | Different versions make Mastra reject our model at the type level |
| Model selection | `NEXO_AGENT_MODEL`: empty or `mock` uses the simulated model; any other value is a Mastra model router ID (for example `anthropic/claude-opus-5-5`) | A separate boolean flag | One variable, and the default works with no key (PRD decision 2) |
| Theme | Tailwind v4 `@theme` with the `nexo.pen` variables, resetting the default palette (`--color-*: initial`) | Keeping Tailwind's palette next to ours | Only prototype colors are usable, so screens cannot drift from the prototype |
| Fonts | `next/font/google`: Schibsted Grotesk for the UI, Newsreader for display titles | Self-hosted font files | The fonts the prototype uses, optimized and served by Next.js |
| Icons | `lucide-react` | Other icon sets | The prototype's icons come from the Lucide library |
| Prototype files | Git-ignored `docs/prototype/` | Versioning them | PRD decision 1 |
| Node version | `.nvmrc` with `22` and `engines: ">=22.13 <23"` | Node 24 | The version agreed for this project; Mastra requires 22.13 or newer |
| CI | GitHub Actions on Ubuntu: `pnpm/action-setup` (reads `packageManager`), `actions/setup-node` with `.nvmrc`, `pnpm install --frozen-lockfile` | Other CI providers | Same versions as local development, and a lockfile change has to be committed |

## Contracts

**`@nexo/agent`**

```ts
export const mastra: Mastra; // registers the agent under the key "nexoAssist" and the id "nexo-assist"
```

`packages/agent/src/models`:

```ts
type ScriptStep =
  | { kind: "tool"; toolName: string; input: Record<string, unknown> }
  | { kind: "text"; text: string };
type Script = (prompt: LanguageModelV4Prompt) => ScriptStep;

function createScriptedModel(script: Script): LanguageModelV4;
function resolveModel(modelId?: string): LanguageModelV4 | string;
```

On each model call, the script looks at the prompt and returns one step: call a tool or answer with text. This stage's script:

- user asks about hours → call `consultarHorario`;
- the last message is the result of `consultarHorario` → answer with the hours from that result;
- anything else → a fixed reply saying the agent is in simulated mode.

**`@nexo/shared`**

```ts
TicketType  // zod enum: "INC" | "REQ"
Category    // zod enum: "Acesso" | "Rede e VPN" | "Hardware" | "Software" | "E-mail" | "Outros"
Priority    // zod enum: "critica" | "alta" | "media" | "baixa"
SLA_BY_PRIORITY // Record<Priority, { label; amount; unit: "hours" | "business_hours" | "business_days" }>
```

The values are in Portuguese because they are shown in the UI and stored with the tickets.

**`apps/tickets`**

| Method | Path | Response |
| --- | --- | --- |
| GET | `/health` | `200 {"status":"ok"}` |

**Environment variables**

| App | Variable | Default | Purpose |
| --- | --- | --- | --- |
| web | `NEXO_AGENT_MODEL` | `mock` | Simulated model or a Mastra model router ID |
| web | `ANTHROPIC_API_KEY` | empty | Only needed with an Anthropic model |
| tickets | `PORT` | `4000` | Port of the ticket service |

## Error handling

| Failure | What happens |
| --- | --- |
| Real model configured without its key | The chat shows its existing error state ("Não consegui responder agora…"); the server log names the missing variable |
| The script gets a message it does not handle | It answers with the fixed simulated-mode reply instead of failing |
| Ticket service port in use | The process exits with the Node error that names the port |
| Unsupported Node version | pnpm prints the `engines` warning |

## Test plan

| What | Type | Why it is worth testing |
| --- | --- | --- |
| The agent with the simulated model calls `consultarHorario` and answers with its result | Integration (real Mastra and real tool, no network) | Proves the agent wiring and the simulated mode together. Later stages extend this test pattern for every flow |
| The agent with the simulated model answers without tools for an unknown request | Integration | Covers the fallback path |
| The ticket service answers the health check | Integration (`app.request`) | Proves the service starts and sets up the test harness for Stage 4 |

There are no UI tests in this stage: the only screen is the hello world page, which Stage 3 replaces.

**Manual validation of the acceptance criteria**

1. From a fresh clone: `pnpm install`, copy `apps/web/.env.example`, then `pnpm dev`. Open `http://localhost:3000` and `http://localhost:4000/health`.
2. Ask "qual o horário do service desk?" with no key set, and check the action line and the reply.
3. Set `NEXO_AGENT_MODEL=anthropic/claude-opus-5-5` without a key, and check that the chat shows the error state, which proves the real model is being used.
4. Run `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build`.
5. Open the stage pull request and check that CI passes.
6. Compare the tokens in `globals.css` with the `variables` in `nexo.pen`.
7. Run `pnpm install` with Node 25 and check for the `engines` warning.
8. Search the code for Portuguese comments.

## Commit plan

1. `docs(stage-02): approved PRD for the project skeleton` (done)
2. `docs(stage-02): tech spec for the project skeleton`
3. `chore: convert the repository to a pnpm workspace` — move the web app and the agent with `git mv`, so that history follows the files
4. `chore: shared TypeScript, lint, format and test tooling`
5. `feat(tickets): ticket service skeleton with a health check`
6. `feat(agent): simulated model selected by NEXO_AGENT_MODEL`
7. `feat(web): prototype theme tokens and fonts`
8. `ci: run format, lint, typecheck, tests and build on GitHub Actions`
9. `docs: README for the workspace`

Then a pull request "Stage 02 — Project skeleton" with `Closes #2`.

## Risks

| Risk | Mitigation |
| --- | --- |
| Mastra and AI SDK versions drift and break types | Exact versions pinned; `pnpm typecheck` runs in CI |
| Next.js 16 APIs differ from older docs | Use the docs bundled in `node_modules/next/dist/docs` (as `AGENTS.md` asks) |
| Windows locally, Linux in CI (line endings, path casing) | `.gitattributes` with LF; CI on Ubuntu catches casing issues |
| The machine's global Node is 25 (nvm-windows) | `engines` warns; the README tells how to switch with `nvm use` |
| pnpm 10 skips dependency build scripts (for example `esbuild`) | `tsx` works without them; CI confirms it on a clean install |
