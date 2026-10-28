# Stage 04 — Domain and ticket service: PRD

|        |                                                            |
| ------ | ---------------------------------------------------------- |
| Issue  | [#4](https://github.com/paulojnneto/service-desk/issues/4) |
| Status | Approved (2026-10-28)                                      |
| Covers | M4, R1, R2, R5, R7, R9, N5, N6 (tickets), N7               |

## Problem

The ticket service from Stage 2 only answers a health check. Everything the agent will do in Stage 6 depends on it, and today none of it exists:

- **No tickets and no help center (M4).** The agent cannot look up "my tickets", open one, add information or answer from an article, because there is no data and no API for it.
- **No deadlines (R9).** "Is it overdue?" (story F2) and one of the handoff triggers (R6) need deadlines counted in business hours, which is easy to get wrong.
- **No privacy boundary (R7).** Nothing stops one employee from reading another employee's ticket.
- **No legacy behavior (N5).** The challenge says the ticket system is legacy and sometimes unavailable for a few seconds. Nothing simulates that, and nothing recovers from it.
- **No persistence (N6).** Tickets must survive a restart, and the project has no database yet.

## Goal

At the end of this stage, a separate ticket service stores tickets and help center articles in PostgreSQL, enforces privacy and the Annex A rules that belong to the data, calculates deadlines in business hours, sometimes fails like a legacy system, and is reached through a client that survives those failures. Every rule is covered by tests, and the agent can use all of it from Stage 6.

## Requirements

| ID      | Requirement                                                                                                                                                                                                 | Source      |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| S-04.1  | PostgreSQL runs locally through Docker Compose with one command. The ticket service has its own database; the API's database is created too, for Stage 5                                                    | N6, N7, N8  |
| S-04.2  | The schema is versioned in migrations, applied with one command; another command loads the sample data                                                                                                      | N7, N9      |
| S-04.3  | A ticket has a number (`INC-…` or `REQ-…`), type, title, description, category, priority, who is affected, status, requester, and the times it was opened, last updated and resolved                        | R1, R2, R3  |
| S-04.4  | Each ticket keeps a history of events: opened, updated with new information, status changed, reopened and transferred to an analyst, each with its time and author                                          | A1, R6      |
| S-04.5  | Deadlines follow R9: critical in 1 hour (any time), high in 4 business hours, medium in 3 business days, low in 5 business days. Business hours are Monday to Friday, 8 a.m. to 6 p.m., São Paulo time      | R9          |
| S-04.6  | The deadline counts from the last update, for the first response and for each update. An open ticket past its deadline is overdue; resolved and closed tickets are never overdue                            | R9, F2      |
| S-04.7  | Every request to the service names the requester. A ticket is only returned, changed or reopened for the person who opened it; for anyone else, the service answers as if it did not exist                  | R7, N11     |
| S-04.8  | The service lists the requester's tickets (open ones first) and returns one ticket with its history                                                                                                         | F2, M4      |
| S-04.9  | The service creates a ticket only with every field from R3 filled and valid. Repeating the same creation request (same idempotency key) returns the ticket created the first time instead of a duplicate    | R3, R4, N5  |
| S-04.10 | The service adds new information to an open ticket, which counts as an update for the deadline                                                                                                              | F3          |
| S-04.11 | The service reopens a ticket resolved up to 7 days ago; after that, or for a ticket that is not resolved, it refuses with a clear reason                                                                    | R5          |
| S-04.12 | The service records a transfer to an analyst as an event, with the case summary                                                                                                                             | R6          |
| S-04.13 | The help center has 5 to 10 short articles in Portuguese, including VPN error 809 (Windows 10 only) and the service desk hours, and can be searched by words                                                | F1, Annex B |
| S-04.14 | Sample data covers the Annex B situations: open and overdue, approved, resolved recently (can be reopened), resolved long ago (cannot), and tickets of other employees. Dates are relative to the seed time | Annex B     |
| S-04.15 | The service simulates the legacy system: it sometimes answers slowly or is unavailable for a few seconds. The behavior is configurable and can be turned off                                                | N5          |
| S-04.16 | Only the API can call the service: requests without the service key are refused, and the browser never calls it directly                                                                                    | N11         |
| S-04.17 | A typed client, used by the agent from Stage 6, sets a timeout on every call, retries when the service is briefly unavailable, and reports a clear error when it stays down                                 | N5          |
| S-04.18 | Data survives restarting the service and the database container                                                                                                                                             | N6          |
| S-04.19 | The README explains how to start the database, run the migrations and load the sample data                                                                                                                  | N7          |

## Acceptance criteria

- [ ] `docker compose up -d` starts PostgreSQL; one command applies the migrations and another loads the sample data; the README lists them.
- [ ] Ana sees her own tickets (open ones first) and the history of each one; asking for Carla's ticket as Ana answers "not found".
- [ ] INC-20311 (medium, last update 6 days ago) is overdue; a ticket updated today is not; resolved tickets are never overdue.
- [ ] Unit tests cover deadlines across the end of the day, weekends, high priority within the day, and the critical 1-hour rule.
- [ ] Creating a ticket with a missing field is refused; repeating a creation with the same idempotency key returns the same ticket.
- [ ] Adding information to a ticket records an event and resets its deadline.
- [ ] INC-20150 (resolved 4 days ago) can be reopened; a ticket resolved more than 7 days ago cannot, and the reason is clear.
- [ ] A transfer is recorded in the ticket's history with its summary.
- [ ] Searching the help center for "VPN 809" finds the VPN article; searching for "horário" finds the hours article.
- [ ] With the simulated instability on, some requests are slow or fail; with it off, none do.
- [ ] A request without the service key is refused.
- [ ] The client recovers from a short outage within its retries, and reports a clear error when the service stays down; a creation retried by the client does not create two tickets.
- [ ] Restarting the service and the database keeps the data.
- [ ] Lint, typecheck, tests, build and CI pass.

## Out of scope

- Agent tools that use the service (Stage 6) and the UI cards (Stage 7).
- Storing conversations (Stage 5); this stage only creates the API's empty database.
- Running every app in containers (Stage 12).
- Public holidays in the business-hours calendar (product PRD, section 7).
- Analyst-side ticket operations, such as assigning or answering (Stage 9).

## Dependencies

- Stage 2 (ticket service skeleton) and Stage 3 (people IDs in the sample directory).
- Docker installed locally (it is on the development machine; the README states it as a requirement).

## Decisions

Resolved on 2026-10-28, all following the recommendation: statuses "Aguardando analista", "Em andamento", "Aprovado", "Resolvido" and "Fechado" (open means not resolved or closed); the help center lives in the ticket service; reopening within 7 calendar days; business hours in `America/Sao_Paulo`; one number sequence per type continuing the sample data; simulated instability on in development at a low rate and off in tests; only the API calls the service, with a service key.

## Open questions (resolved)

1. **Statuses.** The prototype shows "Aguardando analista", "Em andamento", "Aprovado" and "Resolvido". _(Recommended: those four plus "Fechado"; open means anything except resolved or closed, so an approved request that was not delivered yet is still open and can be overdue.)_
2. **Help center location.** Should the articles live in the ticket service? _(Recommended: yes, as part of the same legacy service desk platform; the agent keeps no data of its own.)_
3. **Reopening window.** Seven calendar days or seven business days after resolution? _(Recommended: calendar days; the rule says "7 dias" without "úteis", unlike the deadlines.)_
4. **Time zone.** _(Recommended: business hours in São Paulo time, `America/Sao_Paulo`, whatever the server's time zone.)_
5. **Ticket numbers.** _(Recommended: one sequence per type, continuing the sample data: incidents after INC-20311, requests after REQ-10442.)_
6. **Default instability.** _(Recommended: on in development at a low rate, so the client's retries are exercised every day; off in automated tests unless a test turns it on.)_
7. **Who may call the service.** _(Recommended: only the API, with a service key; the browser never calls it, so the requester always comes from the API's session.)_
