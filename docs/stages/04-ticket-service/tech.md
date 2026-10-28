# Stage 04 — Domain and ticket service: tech spec

|        |                                                                                 |
| ------ | ------------------------------------------------------------------------------- |
| Issue  | [#4](https://github.com/paulojnneto/service-desk/issues/4)                      |
| PRD    | [`prd.md`](prd.md), revision 2                                                  |
| Status | Approved on 2026-10-28 (revision 2: signed JWT between the API and the service) |

## Changes in revision 2

PRD decision 8 replaces the service key and the `x-requester-id` header with a JWT signed with ES256 on every call. Affected sections: overview, files, decisions ("Service authentication", "Requester", "Development keys"), contracts, environment variables, error handling, tests and commit 9. The browser session is unchanged.

## Solution overview

```
                        Authorization: Bearer <JWT, ES256, sub = requester, 60 s>
packages/tickets-client ───────────────────────────────▶ apps/tickets (Hono, port 4000)
 timeouts, retries,          Idempotency-Key on POST        │ middleware: instability → token → idempotency
 idempotency keys                                           │ routes: tickets, articles
 (used by the agent in Stage 6)                             │ repository: every query scoped by requester
                                                            ▼
                                            PostgreSQL 18 (Docker Compose, host port 5433)
                                              nexo_tickets  ← this stage
                                              nexo_api      ← created now, used in Stage 5

packages/shared: ticket contracts (zod) and the business-hours deadline rules, used by the service and the client
```

1. **Database:** a `docker-compose.yml` at the root runs PostgreSQL 18 with a named volume and an init script that creates two databases: `nexo_tickets` for the ticket service and `nexo_api` for the API. Each service owns its own database (N8).
2. **Schema and migrations:** Drizzle ORM defines the schema in TypeScript, `drizzle-kit` generates SQL migrations that are committed, and a script applies them. A seed script resets the sample data, with dates computed from the moment it runs.
3. **Rules that belong to the data** live in the service: privacy (every query filters by requester), required fields, the reopening window, and idempotent writes. **Deadlines** are pure functions in `packages/shared`, so the service and later the UI compute "overdue" the same way.
4. **Service authentication:** the API signs a short-lived JWT with its ES256 private key for every call, with the requester as `sub`. The service verifies it with the public key (algorithm, signature, issuer, audience, expiry) and takes the requester only from it. The service cannot issue tokens, because it never holds the private key.
5. **Legacy behavior:** a middleware adds latency and short outages (a few seconds of `503` for every request), driven by configuration.
6. **Client:** a small package that calls the service with a timeout, retries on outages with backoff, sends an idempotency key on every write (the same key on every retry), and turns failures into typed errors.
7. **Tests do not need Docker:** they run the same migrations on **PGlite** (PostgreSQL compiled to WebAssembly, in process). CI stays as it is.

## Files and modules

| Path                                                                  | What changes                                                                                                 | Why                               |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| `docker-compose.yml`, `docker/postgres/init.sql`                      | PostgreSQL 18, volume, health check, the two databases                                                       | S-04.1, S-04.18                   |
| `package.json` (root)                                                 | `db:up`, `db:down`, `db:migrate`, `db:seed`                                                                  | S-04.1, S-04.2                    |
| `packages/shared/src/deadlines.ts`, test                              | `dueAt(priority, from)`, `isOverdue(ticket, now)`, business-hours calendar in `America/Sao_Paulo`            | S-04.5, S-04.6                    |
| `packages/shared/src/tickets.ts`                                      | zod contracts: statuses, "affected", ticket, event, article, create and update inputs, error codes           | S-04.3, S-04.4                    |
| `apps/tickets/src/db/schema.ts`, `drizzle.config.ts`, `drizzle/*.sql` | Tables, sequences, indexes; generated migrations                                                             | S-04.2, S-04.3                    |
| `apps/tickets/src/db/connect.ts`                                      | `node-postgres` pool for the server; PGlite with the migrations for tests                                    | S-04.18, tests                    |
| `apps/tickets/src/repository.ts`                                      | Every query and write, always with the requester                                                             | S-04.7 to S-04.12                 |
| `apps/tickets/src/middleware/*.ts`                                    | Instability, token verification, idempotency                                                                 | S-04.9, S-04.15, S-04.16, S-04.20 |
| `apps/tickets/src/routes/{tickets,articles}.ts`                       | The HTTP API                                                                                                 | S-04.8 to S-04.13                 |
| `apps/tickets/src/seed/{data,run}.ts`                                 | Annex B tickets and the help center articles, relative to "now"                                              | S-04.13, S-04.14                  |
| `apps/tickets/src/scripts/migrate.ts`                                 | Applies the migrations                                                                                       | S-04.2                            |
| `apps/tickets/src/app.ts`, `server.ts`, `env.ts`                      | `createApp({ db, instability, tokenPublicKey })`; env loading as in the API                                  | S-04.15, S-04.16                  |
| `packages/tickets-client/**`                                          | New package: the resilient client, the token signer (`createServiceTokenSigner`) and their tests             | S-04.17, S-04.20                  |
| `packages/shared/src/service-token.ts`                                | Issuer, audience and lifetime of the service token, shared by signer and verifier                            | S-04.20                           |
| `scripts/dev-setup.mjs`, root `pnpm setup`                            | Copies each `.env.example` to `.env.local` when missing and generates a development ES256 key pair into them | S-04.20, N7                       |
| `README.md`                                                           | Database commands and the new variables                                                                      | S-04.19                           |

## Decisions

| Decision                   | Choice                                                                                                                                                                                                                                                                                                                | Alternatives considered                                                 | Reason                                                                                                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data access                | Drizzle ORM 0.45 with `node-postgres`; schema in TypeScript                                                                                                                                                                                                                                                           | Kysely; raw SQL with `pg`; Prisma                                       | Typed queries that still read like SQL; the same schema drives the migrations. Prisma adds a generation step and a binary engine                                                              |
| Migrations                 | `drizzle-kit generate` writes SQL files that are committed and reviewed; a small script applies them with Drizzle's migrator                                                                                                                                                                                          | `drizzle-kit push` (no files)                                           | Versioned, reviewable SQL (S-04.2); `push` is fine for prototyping but leaves no history                                                                                                      |
| Database in tests          | PGlite 0.5 with the same migrations, one fresh database per test file                                                                                                                                                                                                                                                 | Docker in CI (service container); mocking the repository                | Real PostgreSQL behavior (sequences, constraints, full-text search) with no Docker in CI and no shared state between tests                                                                    |
| Local database             | `postgres:18-alpine`, host port **5433**, user and password `nexo` (local only), named volume                                                                                                                                                                                                                         | Host port 5432; a local PostgreSQL install                              | Port 5432 is already taken on the development machine; a container keeps the setup identical for everyone                                                                                     |
| One database per service   | `nexo_tickets` and `nexo_api` on the same server                                                                                                                                                                                                                                                                      | One database with two schemas; two servers                              | Clear ownership (N8) without the cost of two containers                                                                                                                                       |
| Ticket numbers             | Two PostgreSQL sequences, `INC` from 20312 and `REQ` from 10443, after the highest sample numbers                                                                                                                                                                                                                     | One sequence for both; numbers generated in code                        | Matches the prototype's numbering and stays unique under concurrent writes                                                                                                                    |
| Deadline math              | Pure functions in `packages/shared` with `date-fns` 4 and `@date-fns/tz`                                                                                                                                                                                                                                              | Storing a computed due date in the database                             | The rule is testable without a database, and every consumer computes "overdue" at the current time. Storing it would go stale as time passes                                                  |
| Business-time semantics    | High: 4 hours counted only inside 8:00–18:00 Mon–Fri. Medium and low: N business days later at the same time of day, starting from the next business moment if the update happened outside business hours. Critical: 1 wall-clock hour                                                                                | Counting business days as 10-hour blocks                                | Matches how a person reads "3 dias úteis" and keeps the result easy to explain                                                                                                                |
| Privacy                    | The repository takes the requester as a required argument on every function; queries filter by it; a missing match is `404 not_found`                                                                                                                                                                                 | Checking ownership in the route after loading the ticket                | The filter cannot be forgotten in a new route, and other people's tickets never leave the database                                                                                            |
| Idempotent writes          | Every `POST` requires an `Idempotency-Key`; an `idempotency_keys` table stores the first response per requester and key, and a repeat replays it                                                                                                                                                                      | A unique key only on ticket creation                                    | Retrying "add information" or "reopen" after a timeout must not add a second event or answer `409` for something that succeeded                                                               |
| Help center search         | PostgreSQL full-text search with the `simple` configuration over text normalized without accents, terms joined with OR and ranked with `ts_rank`                                                                                                                                                                      | `ILIKE`; a search engine; searching in TypeScript                       | Works the same in PostgreSQL and PGlite; accent-free text makes "horario" find "horário"; OR keeps long questions useful                                                                      |
| Instability                | Middleware with `LEGACY_LATENCY_MS` (random delay up to the value), `LEGACY_OUTAGE_RATE` (chance that a request starts an outage) and `LEGACY_OUTAGE_SECONDS` (outage length). Development defaults: 600 ms, 5 %, 3 s. Tests: off                                                                                     | Random failures per request only                                        | The challenge describes outages "por alguns segundos", which is a window, not single failed requests; a window is also what forces real retries                                               |
| Service authentication     | JWT signed with **ES256** by the API on every call (`Authorization: Bearer`), verified by the service with the public key through `jose` 6: algorithm allow-list `["ES256"]`, issuer `nexo-api`, audience `nexo-tickets`, `exp` at most 60 s after `iat`, required `sub`, `iat`, `exp` and `jti`, 5 s clock tolerance | A fixed shared key (revision 1); HS256 with a shared secret; mutual TLS | PRD decision 8. Asymmetric keys mean the service can verify but never mint tokens, so a leak on the service side cannot impersonate anyone. A short lifetime limits a stolen token to seconds |
| Requester                  | The token's `sub`, checked against the directory in `@nexo/shared`; any `x-requester-id` header is ignored                                                                                                                                                                                                            | A separate requester header (revision 1)                                | The requester is bound to the signature, so it cannot be swapped                                                                                                                              |
| Replay of a captured token | Not tracked by `jti`; mitigated by the 60 s lifetime, HTTPS in production and idempotent writes                                                                                                                                                                                                                       | Storing every `jti` seen                                                | Keeps the service stateless for reads; a replayed write within 60 s replays the stored response instead of acting twice                                                                       |
| Development keys           | `pnpm setup` generates a key pair with `jose` and writes the private key (base64 PEM) to `apps/api/.env.local` and the public key to `apps/tickets/.env.local`; nothing is committed. Both services refuse to start without their key and say to run `pnpm setup`                                                     | A fixed development key pair in the repository                          | "Chaves fora do código": no key, not even a development one, lives in the repository                                                                                                          |
| Client package             | New `packages/tickets-client`, used by the agent tools (Stage 6) and the analyst console (Stage 9)                                                                                                                                                                                                                    | Inside `packages/agent`                                                 | Two consumers; the agent should not own infrastructure code                                                                                                                                   |
| Client retries             | Up to 5 attempts with backoff 250 ms, 500 ms, 1 s, 2 s (with jitter), on network errors, timeouts and `503`; timeout 2 s per attempt; never retries `4xx`                                                                                                                                                             | No retries; unlimited retries                                           | The longest default outage (3 s) is covered by the sum of the waits (3.75 s), and a request that keeps failing ends in about 14 s at most                                                     |
| Sample data dates          | Computed from "now" when the seed runs; REQ-10442's last update is placed 4 business days ago instead of "1 week ago"                                                                                                                                                                                                 | Exactly "1 week ago"                                                    | Seven calendar days always contain five business days, so a low-priority request updated exactly a week ago would be due at that very moment. The prototype shows only INC-20311 as overdue   |

## Contracts

**Statuses and affected people** (`@nexo/shared`)

```ts
TicketStatus = "aguardando_analista" | "em_andamento" | "aprovado" | "resolvido" | "fechado"; // open = not resolvido/fechado
Affected = "so_eu" | "equipe" | "empresa";
EventKind = "opened" | "updated" | "status_changed" | "reopened" | "transferred";
```

**Ticket as returned by the service**

```ts
type Ticket = {
  number: string; // "INC-20311"
  type: "INC" | "REQ";
  title: string;
  description: string;
  category: Category;
  priority: Priority;
  affected: Affected;
  status: TicketStatus;
  requesterId: string;
  openedAt: string; // ISO 8601
  lastUpdateAt: string;
  resolvedAt: string | null;
  dueAt: string | null; // null when resolved or closed
  overdue: boolean;
  canReopen: boolean; // resolved within the last 7 days
  events?: TicketEvent[]; // only on GET /tickets/:number
};
```

**HTTP API** (every route except `/health` needs `Authorization: Bearer <service token>`; every `POST` needs `Idempotency-Key`)

| Method | Path                            | Body                                                                                                                             | Success                                    | Errors                                                                      |
| ------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------- |
| GET    | `/tickets?scope=open\|all`      | —                                                                                                                                | `200 { tickets }`                          | —                                                                           |
| GET    | `/tickets/:number`              | —                                                                                                                                | `200 { ticket }`                           | `404 not_found`                                                             |
| POST   | `/tickets`                      | `{ type, title, description, category, priority, affected }`                                                                     | `201 { ticket }`                           | `400 invalid_input`                                                         |
| POST   | `/tickets/:number/updates`      | `{ message }`                                                                                                                    | `201 { ticket }`                           | `404 not_found`, `409 ticket_closed`                                        |
| POST   | `/tickets/:number/reopen`       | `{ reason }`                                                                                                                     | `200 { ticket }`                           | `404 not_found`, `409 not_resolved`, `409 reopen_window_expired`            |
| POST   | `/tickets/:number/transfers`    | `{ summary }`                                                                                                                    | `201 { ticket }`                           | `404 not_found`, `409 ticket_closed`                                        |
| GET    | `/articles/search?q=`           | —                                                                                                                                | `200 { articles }` (best first, at most 3) | `400 invalid_input`                                                         |
| any    | any                             | missing, malformed, expired or wrongly signed token; wrong issuer, audience or algorithm; unknown `sub`; missing idempotency key | —                                          | `401 invalid_token`, `401 unknown_requester`, `400 missing_idempotency_key` |
| any    | any (during a simulated outage) | —                                                                                                                                | —                                          | `503 unavailable`                                                           |

**Client** (`@nexo/tickets-client`)

```ts
const signToken = createServiceTokenSigner(privateKeyPem); // in the API only
const tickets = createTicketsClient({ baseUrl, signToken, fetch? });
const forAna = tickets.as("ana.souza"); // a fresh token with sub = "ana.souza" on every attempt
await forAna.list("open");
await forAna.get("INC-20311");
await forAna.create(input);              // generates the idempotency key once, reuses it on retries
await forAna.addUpdate("INC-20311", message);
await forAna.reopen("INC-20150", reason);
await forAna.transfer("INC-20311", summary);
await forAna.searchArticles("vpn 809");

class TicketServiceError extends Error {
  kind: "unavailable" | "not_found" | "conflict" | "invalid_request";
  code: string;                          // e.g. "reopen_window_expired"
}
```

**Environment variables**

| App     | Variable                                                           | Default (development)                              |
| ------- | ------------------------------------------------------------------ | -------------------------------------------------- |
| tickets | `DATABASE_URL`                                                     | `postgres://nexo:nexo@localhost:5433/nexo_tickets` |
| tickets | `TICKETS_JWT_PUBLIC_KEY`                                           | Generated by `pnpm setup`; required                |
| tickets | `LEGACY_LATENCY_MS`, `LEGACY_OUTAGE_RATE`, `LEGACY_OUTAGE_SECONDS` | `600`, `0.05`, `3`                                 |
| api     | `TICKETS_JWT_PRIVATE_KEY`                                          | Generated by `pnpm setup`; required from Stage 6   |
| api     | `TICKETS_URL`                                                      | `http://localhost:4000`; used from Stage 6         |

## Error handling

| Failure                                      | Behavior                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Database not running when the service starts | The service exits with a message naming `DATABASE_URL` and `pnpm db:up`                                            |
| Database lost while running                  | `503 unavailable`, logged once; the client treats it like an outage                                                |
| Simulated outage                             | `503 unavailable` for every request during the window; the client retries                                          |
| Client gives up                              | `TicketServiceError` with `kind: "unavailable"`; Stage 6 turns it into an honest message to the employee           |
| Invalid or expired token                     | `401 invalid_token`; the client never retries a 401 (retries after an outage already sign a fresh token each time) |
| Missing key at startup                       | The service exits with a message naming the variable and `pnpm setup`                                              |
| Another person's ticket                      | `404 not_found`, indistinguishable from a ticket that does not exist                                               |
| Invalid input                                | `400 invalid_input` with the zod issue path in the log (not in the response)                                       |
| Reopen not allowed                           | `409` with `not_resolved` or `reopen_window_expired`, so the agent can explain why                                 |
| Seed run against a database with data        | The seed truncates the tables first and says so; it never runs in production                                       |

## Test plan

| What                                                                                                                                                                                                                                                        | Type                                | Why it is worth testing                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------- |
| `dueAt` for each priority: inside business hours, crossing 18:00, starting on Friday evening and on Saturday, critical at night                                                                                                                             | Unit                                | The rule most likely to be wrong (S-04.5) |
| `isOverdue`: open past the deadline, open within it, resolved and closed never                                                                                                                                                                              | Unit                                | S-04.6                                    |
| List: only the requester's tickets, open ones first; get: another person's ticket is 404                                                                                                                                                                    | Integration (PGlite)                | S-04.7, S-04.8                            |
| Create: missing field refused; number from the right sequence; same idempotency key returns the same ticket and status                                                                                                                                      | Integration                         | S-04.9                                    |
| Update: adds an event and moves `lastUpdateAt`, which moves `dueAt`                                                                                                                                                                                         | Integration                         | S-04.10                                   |
| Reopen: within 7 days works; after 7 days and on an open ticket answer the right `409`; a retried reopen replays the first success                                                                                                                          | Integration                         | S-04.11 and idempotency                   |
| Transfer: adds an event with the summary                                                                                                                                                                                                                    | Integration                         | S-04.12                                   |
| Search: "VPN 809" → VPN article; "horario" → hours article                                                                                                                                                                                                  | Integration                         | S-04.13                                   |
| Seed: INC-20311 overdue, INC-20150 reopenable, an old resolved ticket not reopenable, other employees present                                                                                                                                               | Integration                         | S-04.14                                   |
| Token: missing, malformed, expired, signed by another key, other issuer, other audience, `alg` other than ES256 (including `none` and HS256) → 401; unknown `sub` → 401; valid token → the request runs as `sub`, and an `x-requester-id` header is ignored | Integration                         | S-04.16, S-04.20                          |
| Signer: tokens carry `sub`, issuer, audience, `jti` and a 60 s expiry; the client signs a fresh token on each retry                                                                                                                                         | Unit                                | S-04.20                                   |
| Instability with a fixed random source: an outage returns 503 for its window and recovers; off returns none                                                                                                                                                 | Unit (middleware)                   | S-04.15                                   |
| Client: retries through a 3-second outage and succeeds; gives up with `unavailable`; keeps the idempotency key across retries; never retries a 404                                                                                                          | Unit (fake fetch with a fake clock) | S-04.17                                   |

**Manual validation of the acceptance criteria**

1. `pnpm db:up`, `pnpm db:migrate`, `pnpm db:seed`; follow the README from a fresh clone.
2. With `curl`, as Ana: list her tickets, get INC-20311 (overdue), get Carla's ticket (404), add information, reopen INC-20150, reopen INC-19877 (expired), transfer, and search the help center.
3. Repeat a creation with the same `Idempotency-Key` and check that the number is the same.
4. With the default instability, call the list in a loop and see slow answers and short runs of `503`; with `LEGACY_OUTAGE_RATE=0`, none.
5. Call without a token, with an expired token, and with a token signed by a freshly generated key; check that `apps/tickets/.env.local` has only the public key.
6. Restart the service and `docker compose restart postgres`, then list again.

## Commit plan

1. `docs(stage-04): approved PRD for the domain and ticket service` (done)
2. `docs(stage-04): tech spec for the domain and ticket service`
3. `feat(shared): ticket contracts and deadlines in business hours`
4. `chore: PostgreSQL with Docker Compose`
5. `feat(tickets): schema, migrations and database access`
6. `feat(tickets): tickets API with privacy and idempotent writes`
7. `feat(tickets): help center search`
8. `feat(tickets): sample data from Annex B`
9. `feat(tickets): signed service tokens (ES256) and simulated legacy instability` (with `pnpm setup` for the development keys)
10. `feat(tickets-client): client with timeouts, retries and typed errors`
11. `docs: database setup in the README`

Then a pull request "Stage 04 — Domain and ticket service" with `Closes #4`.

## Risks

| Risk                                                         | Mitigation                                                                                                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| PGlite behaves differently from PostgreSQL 18 in some corner | Only standard features are used (sequences, constraints, full-text search with `simple`); manual validation runs against the real container |
| Time-zone bugs in the deadline math                          | All math in `America/Sao_Paulo` through `@date-fns/tz`, with tests that run under a different process time zone                             |
| A reviewer without Docker cannot run the service             | Docker is listed as a requirement in the README; the full containerized setup in Stage 12 makes it one command                              |
| Simulated instability makes local development annoying       | Low default rate and three variables to tune or turn it off                                                                                 |
| `drizzle-orm` 0.45 is recent                                 | Pinned exact version, published more than two weeks ago; the migrations are plain SQL, independent of the ORM                               |

## Deviations during implementation

Recorded after the code, before the pull request.

| Deviation                                                                        | Why                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL is published on host port **55432**, not 5433 (commit `47ec2b7`)      | The development machine runs two local PostgreSQL installs, on 5432 and 5433; connections to 5433 reached the local server instead of the container                                                                                |
| The development keys come from **`pnpm bootstrap`**, not `pnpm setup`            | `pnpm setup` is a built-in pnpm command, which takes precedence over a script of the same name and changes the user environment (it was run once by mistake and added `PNPM_HOME` to the user's `Path`; the user chose to keep it) |
| Token verification was committed **before** the tickets API (commit order 9 → 6) | The routes were written against the real requester from the start, instead of a temporary header                                                                                                                                   |
| A transfer does **not** move the ticket's deadline                               | Moving it would make an overdue ticket look on time to the analyst who receives it                                                                                                                                                 |
| Accents are removed with `\p{Diacritic}`                                         | The first version used a literal character range that was hard to read                                                                                                                                                             |
| The client maps `401` and `400` to `kind: "invalid_request"`                     | Both mean the caller must fix something; retrying does not help                                                                                                                                                                    |
| An extra contract test runs the real client against the real service             | It proves both sides agree on the token, the idempotency keys, the shapes and the error codes                                                                                                                                      |
| `db:seed` restarts the number sequences                                          | So the first ticket created after a seed is always INC-20312, as in the tests                                                                                                                                                      |
