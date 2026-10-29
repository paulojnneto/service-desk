# Security, privacy and resilience review

Done on 2026-10-29 in Stage 11 (PRD S-11.10 and S-11.11), and completed in Stage 12 for the security headers and the Docker Compose stack. Each item says what was checked and where the evidence is, as a test or a reference in the code. The issues found were fixed in their own commits, listed at the end, and what stays open is listed with its reason.

## Who can see what

| Check                                                                                                                                 | Evidence                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The person comes from the session cookie only; no route takes a person from the request                                               | `apps/api/src/auth.ts` (`session`); `chat.test.ts`, "gives the agent the stored history, never the one in the body"                                     |
| Employee routes never take a conversation id: they act on the session's own conversation                                              | `routes/conversations.ts`, `routes/chat.ts`; `conversations.test.ts`                                                                                    |
| A draft id from another person or another conversation is refused (404)                                                               | `drafts/confirm.ts` (`ownWaitingDraft`); `drafts.test.ts`, "answers 404 for another person's draft"                                                     |
| R7 in the ticket service: every call carries a token for one requester, and the service answers "not found" for someone else's ticket | `apps/tickets/src/middleware/service-token.ts`, `routes/tickets.ts`; `apps/tickets` route tests; `flows.test.ts`, "never shows another person's ticket" |
| The ticket picker keeps only the employee's own open tickets, looked up as them                                                       | `packages/agent/src/tools/question.ts`; `tools.test.ts` (`perguntar`)                                                                                   |
| Analyst routes require the analyst role; an employee gets 403 on every one                                                            | `routes/analyst.ts`; `analyst.test.ts`, "refuses employees, even for their own conversation"                                                            |
| The analyst's ticket panel reads only the conversation's employee, as that employee                                                   | `routes/analyst.ts` (`/tickets`); `analyst.test.ts`                                                                                                     |
| The decision detail never says more than the reply: the rationale's rule and a test that Carla's name does not appear                 | `agents/instructions.ts`; `flows.test.ts`; eval `chamado-de-outra-pessoa`                                                                               |
| A prompt injection cannot write a ticket: only the employee's Confirmar writes                                                        | `drafts/confirm.ts`; `flows.test.ts`, "ignores attempts to skip the confirmation"; eval `prompt-injection`                                              |

## Sessions and requests

| Check                                                                                                                                                                                                                                                           | Evidence                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| The cookie holds a sealed random id, httpOnly, SameSite=Lax, Secure in production; the database keeps only its SHA-256                                                                                                                                          | `apps/api/src/session.ts`                                                                         |
| Signing out deletes the session row, so a copied cookie stops working                                                                                                                                                                                           | `session.ts` (`endSession`); `auth.test.ts`                                                       |
| Production refuses to start without a SESSION_SECRET of 32+ characters                                                                                                                                                                                          | `session.ts` (`sessionSecret`)                                                                    |
| CSRF: POSTs must be JSON, which a cross-site page cannot send without a CORS preflight, and the API approves none; PATCH always needs one; SameSite=Lax keeps the cookie off cross-site subrequests                                                             | `apps/api/src/app.ts` (`jsonOnlyPosts`)                                                           |
| Sign-in takes any password for the sample people, by the challenge's rules                                                                                                                                                                                      | Stated in the README; protected by the rate limit below. A real identity provider is out of scope |
| Every response carries the usual security headers and a content security policy that allows only the app's own origin (`default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`); the screens work under it with no violation in the browser console | `apps/api/src/app.ts` (`CONTENT_SECURITY_POLICY`); `app.test.ts`. **Closed in Stage 12**          |
| The ticket service trusts only tokens signed by the API (ES256, 60-second lifetime, issuer and audience checked); it holds only the public key                                                                                                                  | `packages/shared/src/service-token.ts`; `apps/tickets/src/middleware/service-token.ts`            |

## Secrets

| Check                                                                                             | Evidence                                             |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Keys live only in `apps/*/.env.local`, which git ignores; only `.env.example` files are versioned | `.gitignore`; `apps/api/.env.example`                |
| The web app reads no secret: no `process.env` or `import.meta.env` in `apps/web/src`              | Searched on 2026-10-29                               |
| CI scans the whole history for keys on every push and pull request                                | `.github/workflows/ci.yml`, job `secrets` (gitleaks) |
| A local search for OpenAI keys (`sk-…`) in the history found none                                 | Searched on 2026-10-29                               |

## The Docker Compose stack

Added in Stage 12 (`docker compose --profile app up --build`).

| Check                                                                                                                                                                       | Evidence                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| The ticket service publishes no port: only the API reaches it, inside the Compose network, and it still checks the signed tokens                                            | `docker-compose.yml` (`tickets`)                                       |
| The API listens on `127.0.0.1:8080` only, so other machines on the network cannot open it                                                                                   | `docker-compose.yml` (`api`)                                           |
| The keys and the session secret are created on the first start, never printed, and kept in volumes split by service; the ticket service gets only the public key, read-only | `apps/api/src/scripts/compose-setup.ts`; `docker/*-start.sh`           |
| No env file, key or local build enters an image                                                                                                                             | `.dockerignore`                                                        |
| The stack runs with `NODE_ENV=production`: a session secret is required, the cookie is Secure, and the seeds refuse to run except on an empty database at start             | `apps/api/src/session.ts`; `apps/*/src/scripts/seed.ts` (`--if-empty`) |
| The model key comes only from a root `.env`, which git ignores                                                                                                              | `.gitignore`; `.env.example`                                           |

## Logs and error messages

| Check                                                                                                           | Evidence                                                                                                             |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| The API logs what failed, never a query's parameters (people's messages, ids, session hashes)                   | `apps/api/src/log.ts`; `log.test.ts`. **Fixed in this review**                                                       |
| A failed model reply reaches the browser as the code "unavailable"; the provider's message goes only to the log | `routes/chat.ts`; `chat.test.ts`, "sends no record and saves nothing when the reply fails". **Fixed in this review** |
| Error bodies are codes (`invalid_input`, `not_found`, `unavailable`), with no stack or internal message         | Every route in `apps/api/src/routes`                                                                                 |
| The ticket service logs which fields were invalid, not their values                                             | `apps/tickets/src/routes/tickets.ts` (`parseBody`)                                                                   |

## Abuse and cost

| Check                                                                                                                                      | Evidence                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| 10 sign-ins and 30 chat messages a minute per address; x-forwarded-for only behind a trusted proxy                                         | `apps/api/src/rate-limit.ts`; `rate-limit.test.ts`                                 |
| 40 agent turns per employee per day and a US$ 5 daily budget, answered without the model past them; a request for a person still hands off | `apps/api/src/limits.ts`, `routes/chat.ts`; `chat.test.ts`, "usage limits"         |
| 30 employee messages per conversation, on the server                                                                                       | Stage 5; `chat.test.ts`, "refuses the 31st message"                                |
| At most 6 model calls per turn, 60 seconds per turn, one retry                                                                             | `agents/nexo-assist.ts` (`maxSteps`); `routes/chat.ts`; `chat.test.ts`, "deadline" |
| Usage and estimated cost stored per reply                                                                                                  | `decisions` table; `chat.test.ts`, "stores the turn's model, calls, tokens…"       |

## When the ticket service is down

The legacy service is sometimes unavailable for a few seconds (N5). The client retries 4 times with short waits (`packages/tickets-client`), then each path behaves as follows:

| Path                                                | Behaviour                                                                          | Evidence                                                                      |
| --------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| The agent reads tickets or the help center          | The tool answers `indisponivel`; the agent says so and offers to try again         | `tools.test.ts`; `decision.test.ts` (outcomes)                                |
| The employee confirms a draft                       | 503; the draft stays pending and can be confirmed later                            | `drafts.test.ts`, "keeps the draft pending when the ticket service is down"   |
| The employee edits a draft and the category changes | 503; the draft stays as it was                                                     | `drafts.test.ts`, "keeps the draft as it was…". **Test added in this review** |
| The agent hands off with a related ticket           | The handoff still happens and keeps the ticket; only the transfer event is skipped | `agent-services.test.ts`. **Test added in this review**                       |
| The analyst opens the ticket panel                  | 503 and "Tentar de novo"; the rest of the console works                            | `analyst.test.ts`, "answers 503 when the ticket service is down"              |
| The ticket card in the chat                         | A short message instead of an empty card                                           | `parts.test.ts` (`cardsOf`)                                                   |

## Fixed in this review

- `a178cf5` `fix(api): logs keep what failed, not the query's parameters`
- `a01ca13` `fix(api): the browser gets a plain error code when a reply fails`
- `ac48683` `test(api): the ticket service outage paths without a test`

## Open, with the reason

- **Publishing the app.** Deployment is the challenge's bonus (N12) and was not done. What a deployment would rely on is in place: the usage limits, keys outside the code, `TRUST_PROXY` for a proxy's address, and the checks above. A deployment would still need HTTPS, its own secrets store and a review of the provider's network.
- **Mastra's warning about in-memory storage.** At start, Mastra says it has no storage configured. Nothing depends on it: the agent has no Mastra memory, and conversations, decisions and sessions live in the API's PostgreSQL.
- **The in-memory rate limit resets on restart and is per instance.** Accepted for one instance; the daily limits, which protect the money, are in the database.
- **A model can still write a rationale that leaks.** The instructions forbid it and the evals check one case, but a model's text cannot be guaranteed by code. The tools and outcomes beside it come from code.
- **Any password works.** The challenge's rule for the sample people; a real deployment would need an identity provider.
