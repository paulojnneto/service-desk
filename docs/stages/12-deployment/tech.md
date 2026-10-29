# Stage 12 — One-command run and final README: tech spec

|        |                                                              |
| ------ | ------------------------------------------------------------ |
| Issue  | [#12](https://github.com/paulojnneto/service-desk/issues/12) |
| PRD    | `prd.md` (revised and approved on 2026-10-29)                |
| Status | Approved on 2026-10-29                                       |

## Solution overview

```
docker compose --profile app up --build
  ├─ postgres        (already there; host port 55432, used by pnpm dev too)
  ├─ setup           one-off, from the API image
  │     ├─ creates nexo_app_api and nexo_app_tickets when missing           S-12.3, S-12.7
  │     └─ writes the key pair and the session secret when missing:         S-12.3
  │           volume api-secrets      ← private key, session secret
  │           volume tickets-secrets  ← public key only
  ├─ tickets         waits for setup; no published port                     S-12.6
  │     └─ start: read the public key → migrate → seed if empty → serve :4000
  └─ api             waits for setup and tickets; 127.0.0.1:8080 → :3001     S-12.1, S-12.2
        └─ start: read the private key and secret → migrate → seed if empty → serve
              ├─ /api/*, /health
              ├─ every other path → apps/web/dist, or index.html for the router
              └─ security headers and the content security policy on every response  S-12.8
```

`pnpm dev` does not change: Vite still serves the screens and forwards `/api`, and no `WEB_DIST` is set, so the API serves no pages.

## Images

One Dockerfile per service (PRD decision 3), both built with the repository root as context, so they can use the workspace packages:

- `apps/api/Dockerfile`: `node:22-alpine`, `corepack enable`, then `pnpm install --frozen-lockfile --filter @nexo/api... --filter @nexo/web...`, then `pnpm --filter @nexo/web build`. It runs `tsx src/server.ts` from `apps/api`, the same as `pnpm start`. It sets `WEB_DIST=/app/apps/web/dist`.
- `apps/tickets/Dockerfile`: the same, with `--filter @nexo/tickets...`.
- A `.dockerignore` keeps `node_modules`, `dist`, `.git`, every `.env*` except the examples, `docs/prototype` and `*.pem` out of the build context. No secret can enter an image.

The dev dependencies stay installed, because `tsx` runs the TypeScript directly. A slimmer image with a compile step is listed under "With more time".

## First start (S-12.3)

**`setup` service** (`docker/setup.mjs`, run with the API image):

1. Connects to PostgreSQL as `nexo` and runs `CREATE DATABASE` for `nexo_app_api` and `nexo_app_tickets` when they are missing. `docker/postgres/init.sql` runs only when the volume is new, and the developer's volume already exists, so the setup creates them itself.
2. When `/secrets/api/tickets_private_key` is missing, it creates an ES256 pair with `jose`, as `pnpm bootstrap` does. The private key goes to the `api-secrets` volume and the public key to `tickets-secrets`. The ticket service mounts only `tickets-secrets`, read-only, so it never sees the private key.
3. When `/secrets/api/session_secret` is missing, it writes 32 random bytes in hex.

`api` and `tickets` depend on it with `condition: service_completed_successfully`.

**Start scripts** (`docker/api-start.sh`, `docker/tickets-start.sh`): they export the keys from the mounted files (`TICKETS_JWT_PRIVATE_KEY`, `SESSION_SECRET`, `TICKETS_JWT_PUBLIC_KEY`), run `migrate.ts`, run `seed.ts --if-empty`, and then `exec tsx src/server.ts`. One instance per service, so migrating at start is safe (PRD, out of scope: more than one instance).

**Change to PRD decision 4:** each service migrates and seeds its own database at start, instead of the setup service doing it for both. The setup would otherwise need both apps' code in one image, which goes against decision 3. Keeping the database work with its owner also matches the rest of the project. The keys and the databases stay in `setup`.

## Seeds in production (PRD decision 5)

Both `seed.ts` scripts accept `--if-empty`:

- Without the flag, nothing changes. They keep refusing production, and in development they reset the data, as `pnpm db:seed` does today.
- With the flag, they run in production too, but only seed when the data is empty: no rows in `tickets` for the ticket service, no rows in `conversations` for the API. Otherwise they log "Sample data already there; nothing to do."

The emptiness check is a small exported function in each seed module (`isEmpty(db)`), with a PGlite test. Only the start scripts pass the flag.

## Security headers and pages (S-12.2, S-12.8)

In `apps/api/src/app.ts`:

- `secureHeaders()` from `hono/secure-headers` on every response, with the content security policy:

  ```
  default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:;
  font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self';
  frame-ancestors 'none'; form-action 'self'
  ```

  The fonts come from `@fontsource-variable`, bundled by Vite, so nothing comes from Google. `data:` covers the small assets that Vite inlines. The React `style` prop sets styles through the DOM, which `style-src 'self'` allows. The browser check confirms the policy and adjusts it only with a reason written here. Hono also sends its other default headers: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Strict-Transport-Security` and the rest.

- `createApp` gets a `webDist?: string` option, which `server.ts` reads from `WEB_DIST`. When it is set, `serveStatic` from `@hono/node-server/serve-static` serves the files. Any other GET outside `/api` and `/health` answers with `index.html`. An unknown `/api/*` path keeps answering a JSON 404, not the page.

- `server.ts` logs the model at start: `Agent model: mock (simulated, no key needed)` or `Agent model: openai/gpt-5.5`, using `modelName()` (S-12.5).

Tests (`app.test.ts`): the headers and the policy are on `/health` and on an API answer. With a temporary `webDist`, `/` and `/console` answer the page with the policy, `/assets/x.js` answers the file, and `/api/nope` answers a JSON 404.

## Compose (PRD decisions 1 and 6)

Added to `docker-compose.yml` under `profiles: [app]`, so `pnpm db:up` keeps starting only PostgreSQL:

- `setup`, `tickets` and `api` as above. They connect to `postgres:5432` inside the network.
- `api` publishes `127.0.0.1:8080:3001`: only this machine can open it. `tickets` publishes nothing.
- Volumes: `api-secrets` and `tickets-secrets`, plus the existing `pgdata`.
- Health checks: `wget -qO- http://localhost:<port>/health`. The API waits for `tickets` to be healthy.
- Environment: `NODE_ENV=production`, the database URLs of `nexo_app_*`, `TICKETS_URL=http://tickets:4000`. From the root `.env`, with defaults, it reads `NEXO_AGENT_MODEL` (default `mock`), `OPENAI_API_KEY`, `NEXO_AGENT_TURNS_PER_DAY` and `NEXO_DAILY_BUDGET_USD`.

**Root `.env.example`:** `NEXO_AGENT_MODEL=openai/gpt-5.5` and an empty `OPENAI_API_KEY=`. To use the real model, the reviewer copies it to `.env` and pastes the key. Without `.env`, the default is the simulated model. `.gitignore` already ignores `.env`.

**Change to S-12.5:** the model is named in `.env` next to the key, instead of being picked from the key's presence. A rule like "a key means GPT-5.5" would be hidden logic in a script, and the variable is the one the project already uses.

**Cookies:** with `NODE_ENV=production` the cookie is `Secure`. Chrome, Edge and Firefox accept `Secure` cookies on `http://localhost`. The README says so. The browser check uses Chrome.

## Smoke test (S-12.9, PRD decision 8)

`scripts/smoke.mjs`, run as `pnpm smoke [url]` (default `http://localhost:8080`), with Node's `fetch` only:

1. Waits up to 120 s for `/health`, because the first build and migrations take a while.
2. `GET /` answers HTML with a `Content-Security-Policy` header.
3. Signs in as Ana and keeps the cookie. `POST /api/chat` with one message ("Meu Outlook não abre"), reads the stream to the end, and expects text and a `message-metadata` chunk with a decision.
4. Signs in as Rafael. `GET /api/analyst/conversations` lists the sample conversations.
5. Prints one line per check and exits 1 on the first failure.

With a real model it spends one turn. The script says so before sending, and runs only when someone types the command.

## CI (S-12.9)

A new `compose` job in `.github/workflows/ci.yml`: checkout, setup Node from `.nvmrc`, `docker compose --profile app up -d --build`, `node scripts/smoke.mjs`, then `docker compose --profile app logs` when a step fails. It uses no `.env`, so it runs the simulated model. It needs no `pnpm install`, because the smoke script has no dependencies.

## README (S-12.10, PRD decision 9)

New order:

1. **Nexo Assist**: one paragraph on what it is, then a screenshot.
2. **Try it**: the one command, the address, the accounts (Ana, Rafael, any password), the real model through `.env`, and how to stop and reset (`docker compose --profile app down`, and `-v` to erase).
3. **Run for development**: the current `pnpm` path, unchanged.
4. **Architecture**: the current section, tightened.
5. **How the agent decides**: the current section.
6. **How quality was ensured**: tests, evals and CI, as today.
7. **Model, cost and limits**: as today.
8. **Security**: a short summary with a link to `docs/security.md`.
9. **Trade-offs**: new. Polling instead of a push channel, an in-memory rate limit, any password, `tsx` at runtime, the simulated legacy service, one instance, and why each was accepted.
10. **With more time**: new. Deployment, the bonus N12, with what is ready for it. Also a gpt-6 candidate through the eval set, a push channel, an identity provider, compiled images, and more eval scenarios.
11. **How we worked**: the stage process in a few lines, with a link to `docs/stages/`.

Nothing true is removed. A long section moves to `docs/` only when the README links it.

## Security review (closes the open item)

`docs/security.md`: the item "Security headers and a content security policy" moves from "Open" to a new row under "Sessions and requests", with `app.ts` and the tests as evidence. A row for the Compose stack records that the ticket service publishes no port, the API binds to 127.0.0.1, the keys live in volumes split by service, and nothing secret is in an image. Publishing stays open as the bonus not done.

## Commits

1. `feat(api): security headers and a content security policy`: `secureHeaders`, and the model logged at start. Tests.
2. `feat(api): serve the built screens on the API's origin when WEB_DIST is set`. Tests.
3. `feat: seed sample data on first start only, with --if-empty`. `isEmpty` with tests in both apps.
4. `build: Docker images and the Compose app profile`: the Dockerfiles, `.dockerignore`, `docker/setup.mjs`, the start scripts, the compose services and the root `.env.example`.
5. `feat: pnpm smoke checks a running stack`.
6. `ci: start the Compose stack and run the smoke test`.
7. `docs: close the security headers item and review the Compose stack`.
8. `docs: final README`.
9. `docs(stage-12): verification and deviations`: browser pass (Ana, Rafael, the headers, a restart, `pnpm dev` beside it), the GPT-5.5 turn after asking, and the deviations.

## Verification

- `pnpm lint`, `typecheck`, `test`, `eval`, `build` and `format:check`.
- `docker compose --profile app up --build` on this machine, beside your `pnpm dev`. It uses port 8080 and its own databases, and does not touch ports 3000, 3001 and 4000. Then `pnpm smoke`.
- A browser pass on `http://localhost:8080` with the simulated model: Screens 2 to 5, "Por quê?", the console, no CSP errors in the console.
- `docker compose --profile app restart`: same conversations, same keys.
- One GPT-5.5 turn through `.env`, only after asking. You paste the key.
