# Stage 12 — One-command run and final README: PRD

|        |                                                              |
| ------ | ------------------------------------------------------------ |
| Issue  | [#12](https://github.com/paulojnneto/service-desk/issues/12) |
| Status | Revised and approved on 2026-10-29                           |
| Covers | N3, N6, N7, N8, N11                                          |

## Revision

The first version of this PRD, approved on 2026-10-29, planned a public deployment on Render. It was dropped the same day: the project will not be published anywhere. In the challenge, deployment is a bonus (N12), not a requirement. What the challenge does require is a project that runs locally with a few documented commands (N7) and a README that explains it (N3, N8).

The stage now aims at the reviewer who clones the repository: one command starts everything with Docker Compose, and the README is the final document. The branch keeps its name, `stage/12-deployment`. The suggested new title for issue #12 is "One-command run and final README".

## Problem

- **Running the project takes five steps and three tools.** A reviewer needs Node 22, pnpm and Docker, then `pnpm install`, `pnpm bootstrap`, `pnpm db:up`, `pnpm db:migrate`, `pnpm db:seed` and `pnpm dev`. Docker alone is enough to run containers, but today it only runs PostgreSQL.
- **Nothing runs as a built app.** Every service runs through its development server. The web app has no server of its own: Vite serves the screens and forwards `/api` to the API.
- **One item from the Stage 11 review is still open.** Security headers and a content security policy depend on how the app is served, and `docs/security.md` left them for this stage.
- **The README grew stage by stage.** It is complete but reads as a build log. Three things the challenge asks for are scattered or missing: the trade-offs, what we would do with more time, and an order a reviewer can follow.

## Goal

At the end of this stage, a reviewer with only Docker clones the repository, runs one command and opens one address. They sign in as Ana or as Rafael and see the cards, the decision detail and the analyst console with the sample data, using the simulated model, or GPT-5.5 if they set their own key. The development path (`pnpm dev`) keeps working as before. The README is the final document of the challenge: it covers every item asked for, in an order a reviewer can follow.

## Requirements

| ID      | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Source       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| S-12.1  | **One command:** `docker compose --profile app up --build` starts PostgreSQL, the ticket service and the API serving the built screens. Docker is the only requirement                                                                                                                                                                                                                                                                                                                                        | N7           |
| S-12.2  | **One address:** the API serves the built web app and answers every other path with `index.html` for the router, so the screens and `/api` share one origin and the session cookie works as in development                                                                                                                                                                                                                                                                                                    | N7, N11      |
| S-12.3  | **Ready on first start:** the first start creates the service token key pair and the session secret, applies the migrations and loads the sample data. Later starts keep the keys and the data, and apply only new migrations                                                                                                                                                                                                                                                                                 | N6, N7       |
| S-12.4  | **Survives a restart:** stopping and starting the stack keeps conversations, decisions and tickets                                                                                                                                                                                                                                                                                                                                                                                                            | N6           |
| S-12.5  | **The model is the reviewer's choice:** without a key, the stack uses the simulated model and says so in the logs. With `OPENAI_API_KEY` set in a root `.env` file, it uses GPT-5.5 with the Stage 11 limits. A root `.env.example` documents this, and git ignores `.env`                                                                                                                                                                                                                                    | N3, N10, N11 |
| S-12.6  | **The ticket service stays private:** only the API reaches it, inside the Compose network. It publishes no port, and it still checks the API's signed tokens                                                                                                                                                                                                                                                                                                                                                  | N5, N11      |
| S-12.7  | **No clash with development:** the stack uses its own host port and its own databases, so it can run beside `pnpm dev` without touching its data                                                                                                                                                                                                                                                                                                                                                              | N7           |
| S-12.8  | **Security headers:** the API sends the usual security headers, and the pages it serves send a content security policy that allows only the app's own origin. This closes the open item of `docs/security.md`                                                                                                                                                                                                                                                                                                 | N11          |
| S-12.9  | **Checked in CI:** a CI job builds the images, starts the stack with the simulated model, and checks the health of the app, a sign-in and one agent turn                                                                                                                                                                                                                                                                                                                                                      | N8           |
| S-12.10 | **Final README:** it opens with "Try it" (the one command and the sample accounts), then follows the challenge's items: how to run (the Compose path and the development path), architecture, how the agent decides, how quality was ensured, the model and its cost, the main trade-offs and what we would do with more time. Deployment is listed as the bonus not done, with what is already in place for it. The stage-by-stage detail moves to a short "How we worked" section that links `docs/stages/` | N3, N7, N8   |

## Acceptance criteria

- [ ] On a clean clone, `docker compose --profile app up --build` starts the stack, and the address opens the sign-in screen.
- [ ] Signing in as Ana and as Rafael works, and the session survives a reload.
- [ ] As Ana, Screens 2 and 3 work with the simulated model, with the cards and "Por quê?".
- [ ] As Rafael, the console lists the sample conversations, and Rafael can take one over and reply.
- [ ] With a key in `.env`, one turn with GPT-5.5 works (run once, after asking).
- [ ] The ticket service publishes no port.
- [ ] A restart keeps the conversations and the tickets; the keys are not created again.
- [ ] `pnpm dev` and its data are unchanged with the stack running beside it.
- [ ] Responses carry the security headers, the pages carry the content security policy, and the screens work with them.
- [ ] `docs/security.md` has no item left open for this stage.
- [ ] The README covers every item the challenge asks for.
- [ ] Lint, typecheck, tests, evals, build and CI, including the new Compose job, pass.

## Out of scope

- Publishing the app anywhere: the bonus N12. The README says what is ready for it.
- A reverse proxy, HTTPS on localhost or a custom domain.
- Hot reload inside the containers: development stays with `pnpm dev`.
- Images published to a registry.
- A real identity provider. Sign-in keeps the challenge's rule: any password for the sample people.

## Dependencies

- Stages 1 to 11, and the Stage 11 limits and review.
- Docker with Compose v2 on the reviewer's machine.
- For the GPT-5.5 check: the user's OpenAI key, which the user pastes into `.env` and Claude never types.

## Decisions

Resolved on 2026-10-29, all following the recommendation: the same Compose file with an `app` profile; the API serves the built web app; one Dockerfile per service, run with `tsx`; a one-off `setup` service for keys, secret, migrations and first-start data; `NODE_ENV=production` with an explicit seed opt-in for the setup service only; host port 8080 and databases of its own; a content security policy of `default-src 'self'` plus what the screens need; a `pnpm smoke [url]` script run in CI with the simulated model; a final README starting with "Try it".

## Open questions (resolved)

1. **Same Compose file or a new one.** _(Recommended: the same `docker-compose.yml`, with the new services under the `app` profile. `pnpm db:up` keeps starting only PostgreSQL, as today, and the reviewer still has one file to read.)_
2. **How the screens are served.** _(Recommended: the API serves `apps/web/dist`, as in the first version of this PRD: one origin, one place for the headers, and the cookie works exactly as in development. A separate nginx container would need no code, but it would add a second place for headers and the `/api` proxy.)_
3. **Images.** _(Recommended: one Dockerfile per service, the API with the web build and the ticket service, built from the monorepo with pnpm and Node 22. They run with `tsx`, as `pnpm start` does today, so there is no separate compile step to keep in sync.)_
4. **First-start setup.** _(Recommended: a short-lived `setup` service, from the API's image, that runs before the others. It creates the keys and the session secret in a named volume when they are missing, applies the migrations of both databases, and loads the sample data only when the databases are empty. The other services wait for it to finish. Nothing secret is written to the repository or baked into an image.)_
5. **Production mode.** The seeds refuse to run in production, and production requires `SESSION_SECRET` and sets the cookie as Secure. _(Recommended: the stack runs with `NODE_ENV=production`, so it exercises the same guards as a real deployment. The secret comes from the setup volume. Browsers accept Secure cookies on `http://localhost`. The seeds get an explicit opt-in flag that only the setup service sets, and keep refusing production in every other case.)_
6. **Ports and databases.** _(Recommended: the app on host port 8080, and two new databases, `nexo_app_api` and `nexo_app_tickets`, in the same PostgreSQL. `pnpm dev` uses ports 3000, 3001 and 4000 and the `nexo_api` and `nexo_tickets` databases, so neither touches the other's data.)_
7. **Content security policy.** _(Recommended: `default-src 'self'`, plus only what the built screens need, found and confirmed in the browser. The other headers come from Hono's `secureHeaders` on every response.)_
8. **The CI check.** _(Recommended: one job that runs the stack with the simulated model and a small script, `pnpm smoke [url]`, defaulting to `http://localhost:8080`. The script checks the health, signs in as Ana and as Rafael, sends one message and reads the reply, and opens the console list. The same script works on the reviewer's machine.)_
9. **The README's shape.** _(Recommended: "Try it" first, with the one command and the accounts. Then the challenge's order. The sections that already exist stay, tightened. Two new sections are added, "Trade-offs" and "With more time". Deployment appears under "With more time" as the bonus not done, with what is ready for it: limits, keys outside the code, `TRUST_PROXY` and the security review. Nothing true is removed; long details move to `docs/` with links.)_
