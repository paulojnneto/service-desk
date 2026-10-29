# Stage 12 — Deployment and final README: PRD

|        |                                                              |
| ------ | ------------------------------------------------------------ |
| Issue  | [#12](https://github.com/paulojnneto/service-desk/issues/12) |
| Status | Approved on 2026-10-29                                       |
| Covers | N3, N6, N7, N8, N11, N12                                     |

## Problem

The project works on a developer's machine, and only there:

- **Reviewers have to run it.** Testing Nexo Assist means installing Node 22, pnpm and Docker, running the bootstrap and the seeds, and getting an OpenAI key. Most reviewers will not.
- **Production was never configured.** The code refuses to start without `SESSION_SECRET` in production, and the seeds refuse to run there. Nothing says how the two services, the two databases, the keys, the proxy (`TRUST_PROXY`) and the limits fit together outside `pnpm dev`.
- **The web app has no server of its own.** In development, Vite serves the screens and forwards `/api` to the API. A deployment needs the same single origin, or the session cookie (SameSite=Lax, Secure) breaks.
- **Open items from the Stage 11 review.** Security headers and a content security policy depend on how the app is served.
- **The README grew stage by stage.** It is complete but reads as a build log. Three things the challenge asks for are scattered or missing: the trade-offs, what we would do with more time, and how the deployment was done.

## Goal

At the end of this stage, a reviewer opens one HTTPS link, signs in as Ana or as Rafael, and uses the agent with the real model, the cards, the decision detail and the analyst console. Keys stay protected and the Stage 11 limits are active. The deployment is described in the repository, so it can be repeated. The README is the final document of the challenge: it covers every item asked for, in an order a reviewer can follow.

## Requirements

| ID      | Requirement                                                                                                                                                                                                                                                                                                                                         | Source                |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| S-12.1  | **One public HTTPS address** serves the screens and the API, so the session cookie works as in development (single origin, Secure, SameSite=Lax)                                                                                                                                                                                                    | N12, N11              |
| S-12.2  | **Everything runs:** the web app, the agent API, the ticket service and PostgreSQL (the API's database and the ticket service's), and survives a restart (N6)                                                                                                                                                                                       | N6, N12               |
| S-12.3  | **The ticket service is not public:** only the API reaches it, and it still checks the API's signed tokens                                                                                                                                                                                                                                          | N5, N11               |
| S-12.4  | **Keys are protected:** the OpenAI key, `SESSION_SECRET` and a new token key pair for production live only in the hosting provider's secret settings. None is in the repository or in the web app, and production keys differ from development ones                                                                                                 | N11, N12              |
| S-12.5  | **The real model, within limits:** the deployment uses GPT-5.5 with the Stage 11 allowance and daily budget, and `TRUST_PROXY` set for the provider's proxy                                                                                                                                                                                         | N3, N10, N12          |
| S-12.6  | **Sample data to try:** on the first deployment, the Annex B tickets and articles and the sample conversations for the console are loaded through an explicit, documented opt-in. A documented command resets them; the production guard of the seeds stays for every other case                                                                    | N7, N12               |
| S-12.7  | **Migrations on deploy:** each release applies pending migrations before the API serves requests                                                                                                                                                                                                                                                    | N6                    |
| S-12.8  | **Security headers:** the pages and the API send the usual security headers and a content security policy that allows only the app's own origin. This closes the open item of `docs/security.md`                                                                                                                                                    | N11                   |
| S-12.9  | **Reproducible:** the deployment is described as files in the repository (images and the provider's configuration), so it can be created again from them                                                                                                                                                                                            | N8                    |
| S-12.10 | **Checked after deploying:** a short smoke test checks the health of each service, sign-in, a screen and one agent turn, and its result is recorded                                                                                                                                                                                                 | N12                   |
| S-12.11 | **Final README:** it opens with the link and the sample accounts, then follows the challenge's items: how to run, architecture, how the agent decides, how quality was ensured, the model and its cost, how the deployment was done, the main trade-offs, and what we would do with more time. The stage-by-stage detail moves below, or to `docs/` | N3, N7, N8, Issue #12 |

## Acceptance criteria

- [ ] The link opens the sign-in screen over HTTPS; signing in as Ana and as Rafael works, and the session survives a reload.
- [ ] As Ana, Screen 2 (VPN error 809) and Screen 3 (status, INC-20311) work with the real model, with the cards and "Por quê?".
- [ ] As Rafael, the console lists the sample conversations, and Rafael can take one over and reply.
- [ ] The ticket service does not answer from the internet.
- [ ] No key is in the repository; `gitleaks` passes; the production secrets are set in the provider only.
- [ ] Responses carry the security headers and the content security policy, and the app works with them.
- [ ] A restart of the services keeps the conversations and the tickets.
- [ ] The smoke test passed on the published link, and its date is in the README.
- [ ] The README covers every item the challenge asks for and explains the deployment.
- [ ] Lint, typecheck, tests, evals, build and CI pass.

## Out of scope

- A custom domain; the provider's address is enough.
- Production monitoring, alerts and log aggregation beyond the provider's own logs.
- Automatic resets of the demo data on a schedule.
- More than one instance per service, autoscaling and zero-downtime deploys.
- A real identity provider. Sign-in keeps the challenge's rule: any password for the sample people.

## Dependencies

- Stages 1 to 11, and the Stage 11 limits and review.
- **An account with the chosen hosting provider, created and paid for by the user.** Claude cannot create accounts or enter payment details. Claude prepares the files and the steps, and the user connects the repository and pastes the secrets: the OpenAI key, which Claude never types.
- The OpenAI key for the deployment. A separate key with a spending cap is recommended.

## Decisions

Resolved on 2026-10-29, all following the recommendation: Render with a Blueprint in the repository, a public service for the API and the screens, a private ticket service and a managed PostgreSQL, with the plans and current prices brought by the tech spec for the user to choose; the API serves the built web app on one origin; one Dockerfile per service; GPT-5.5 with the default limits and a spending cap on the OpenAI key; demo data loaded once with `SEED_DEMO=1` and reset by a documented command, with no scheduled reset; a content security policy of `default-src 'self'` plus the usual headers; a `pnpm smoke <url>` script and one browser pass after asking; a final README in the challenge's order with "Try it", "Trade-offs" and "With more time"; Claude prepares the files and the steps, and the user creates the account, connects the repository and pastes the secrets.

## Open questions (resolved)

1. **Which provider.** _(Recommended: **Render**, with a Blueprint (`render.yaml`) in the repository. It describes as code a public web service for the API and the screens, a private service for the ticket service, and a managed PostgreSQL with both databases. Private services and the internal network keep the ticket service off the internet (S-12.3). Railway and Fly.io would also work, with less of the setup in a file. The free plans sleep after a while, and free PostgreSQL expires after some weeks. The tech spec will bring the plans and their current prices, read on the day, for you to choose.)_
2. **How the screens are served.** _(Recommended: the API serves the built web app (`apps/web/dist`) and answers every other path with `index.html` for the router. One service, one origin, one set of headers, and the cookie works exactly as in development. A separate static site would need a rewrite of `/api` and two places for headers.)_
3. **Images.** _(Recommended: one Dockerfile per service (the API with the web build, and the ticket service), built from the monorepo with pnpm, Node 22 and only production dependencies. The same images run anywhere.)_
4. **The model in the demo.** _(Recommended: GPT-5.5, the chosen model, with the default limits (40 turns per employee per day, US$ 5 a day) and a spending cap set on the OpenAI key itself as a second guard. If the budget runs out, the agent pauses and the analyst console keeps working, as in Stage 11. The simulated model would show the screens but not the decisions the challenge is about.)_
5. **Demo data.** Reviewers will confirm drafts and close conversations. _(Recommended: an explicit `SEED_DEMO=1` on the first deploy loads the sample data once, and a documented one-off command resets it. Seeds keep refusing production without that flag. No scheduled reset: it would erase what a reviewer is looking at.)_
6. **Content security policy.** _(Recommended: `default-src 'self'`, with only what the app needs (Tailwind's styles at build time, Google Fonts if used), plus the other usual headers through Hono's `secureHeaders`. The browser check confirms the screens still work.)_
7. **The smoke test.** _(Recommended: a small script, `pnpm smoke <url>`, that:_
   - _checks the health of each service;_
   - _signs in as Ana and as Rafael;_
   - _sends one message and reads one agent reply: one model turn, a few cents;_
   - _opens the console list._

   _Plus a browser pass of Screens 2 to 5, done once after asking, since it uses the model. Its date goes in the README.)_

8. **The README's shape.** _(Recommended: a final document in the challenge's order, starting with "Try it" (link and accounts). The sections that already exist stay, tightened. Two new sections are added, "Trade-offs" and "With more time". The stage history and process move to a short "How we worked" section that links `docs/stages/`. Nothing true is removed; long details move to `docs/` with links.)_
9. **Who does what in the provider.** _(Recommended: Claude writes the Blueprint, the Dockerfiles and a step-by-step in `docs/deployment.md`. The user creates the account, connects GitHub, approves the Blueprint and pastes the secrets in the provider's dashboard. Claude then runs the smoke test against the link and checks the logs the user shares. Claude does not sign in to the provider for the user.)_
