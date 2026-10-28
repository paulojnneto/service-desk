# Stage 03 — Sign-in and employee shell: PRD

|        |                                                            |
| ------ | ---------------------------------------------------------- |
| Issue  | [#3](https://github.com/paulojnneto/service-desk/issues/3) |
| Status | Approved (2026-10-27)                                      |
| Covers | M1, M2 (shell only), N4, N11, base for R7                  |

## Problem

After Stage 2, anyone who opens the app talks to the agent, and the agent has no idea who is talking. That blocks most of the roadmap:

- **No identity, so no privacy (R7, N11).** "Ticket information is only shared with the person who opened it" cannot be enforced while the API does not know who the person is. Stage 4 (tickets) and Stage 5 (conversations) both need a trusted user ID.
- **No sign-in screen (M1).** The challenge asks for Screen 1: corporate email and password, accepting the sample-data employees with any password.
- **No shell for the employee screens (M2, N4).** Screens 2 and 3 share a sidebar, a top bar and a chat area with a composer and a message counter. Every later UI stage (cards, transparency) plugs into that shell.
- **No place for the analyst.** Analysts sign in on the same screen, so they need to land somewhere of their own, even before the console exists (Stage 9).

## Goal

At the end of this stage, a person from the sample directory signs in with their corporate email, the API knows who they are on every request, the employee sees the support shell from the prototype and chats with the simulated agent, and the analyst lands on their own area.

## Requirements

| ID      | Requirement                                                                                                                                                                                                               | Source                    |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| S-03.1  | A sample directory lists the employees and analysts who can sign in, with name, corporate email, department (employees) or support tier (analysts), and the avatar colors used by the prototype                           | M1, Annex B               |
| S-03.2  | The sign-in screen follows Screen 1: the presentation panel (headline, conversation preview, stats) and the form (corporate email, password with show/hide, "keep me signed in", "forgot password", help line, footer)    | M1, N4                    |
| S-03.3  | Any password signs in a directory email; the email is matched without regard to case or surrounding spaces                                                                                                                | M1                        |
| S-03.4  | An unknown email or an empty field shows a clear error next to the form and keeps the email that was typed                                                                                                                | M1, N4                    |
| S-03.5  | Signing in shows a pending state on the button and cannot be submitted twice                                                                                                                                              | N4                        |
| S-03.6  | The session survives page reloads. With "keep me signed in" it lasts 30 days; without it, it lasts one workday (10 hours)                                                                                                 | M1                        |
| S-03.7  | The session cannot be read or forged by browser code: it lives in an HTTP-only, signed and encrypted cookie that holds only the person's ID and role                                                                      | N11                       |
| S-03.8  | Signing out ends the session and returns to the sign-in screen                                                                                                                                                            | M1                        |
| S-03.9  | The API takes the person's identity only from the session, never from the request body. The chat route answers 401 without a session and 403 for analysts                                                                 | N11, base for R7          |
| S-03.10 | Each role reaches only its own area: without a session, every screen goes to sign-in; employees land on the support screen; analysts land on the analyst area; opening the other role's area redirects to one's own       | M1                        |
| S-03.11 | The employee shell follows Screens 2 and 3: sidebar (logo, "Atendimento", "Meu perfil", the signed-in person, "Sair"), top bar (breadcrumb and "Assistente online"), and a centered chat column with composer and counter | M2, N4                    |
| S-03.12 | The counter shows "N/30 mensagens nesta sessão" and, at 30, the composer is disabled with an explanation. In this stage the limit lives only in the UI; Stage 5 enforces it on the server                                 | M2                        |
| S-03.13 | An empty chat greets the employee by first name and offers suggested questions that send a message when clicked                                                                                                           | M2, F1                    |
| S-03.14 | Chat errors show a retry action; an expired session shows a message with a way back to sign-in                                                                                                                            | N4                        |
| S-03.15 | The "Meu perfil" screen shows the person's name and corporate email, marked as managed by IT, and the password card                                                                                                       | Prototype (profile frame) |
| S-03.16 | The analyst area greets the analyst and offers sign-out; the console itself comes in Stage 9                                                                                                                              | M6 (placeholder)          |
| S-03.17 | Loading states: the shell shows placeholders while the session is checked, so the screen never flashes the wrong content                                                                                                  | N4                        |
| S-03.18 | The layout matches the prototype at 1440×900 and stays usable on narrower screens; below 1280 px the sign-in presentation panel is hidden and the form takes the screen                                                   | N4                        |

## Acceptance criteria

- [ ] `ana.souza@nexo.com.br` with any password signs in and lands on the support screen; `rafael.lima@nexo.com.br` lands on the analyst area.
- [ ] `ANA.SOUZA@nexo.com.br ` (different case, trailing space) also signs in.
- [ ] An unknown email shows an error and the email stays in the field; an empty field shows an error.
- [ ] Reloading the page keeps the person signed in; signing out returns to sign-in, and going back does not reopen the shell.
- [ ] Without a session, opening any screen leads to sign-in, and `POST /api/chat` answers 401.
- [ ] With an analyst session, `POST /api/chat` answers 403 and the support screen redirects to the analyst area; with an employee session, the analyst area redirects to the support screen.
- [ ] The session cookie is HTTP-only and its content is not readable (it does not contain the email or the name in plain text).
- [ ] The empty chat greets by first name; a suggestion sends its text; the counter increments with each message sent; at 30 the composer is disabled.
- [ ] Stopping the API makes the chat show the error with a retry action; an expired session shows the way back to sign-in.
- [ ] Sign-in, support screen and profile match the prototype at 1440×900; the sign-in form takes the screen below 1280 px.
- [ ] Automated tests cover signing in, signing out, the 401 and 403 answers, and that the identity comes only from the session.
- [ ] Lint, typecheck, tests, build and CI pass.

## Out of scope

- Real authentication (SSO or the network password) and password reset; "Esqueci minha senha" and "Redefinir senha" only show how to get help.
- The analyst console (Stage 9).
- Ticket cards, picker and draft (Stage 7).
- Saving conversations and enforcing the message limit on the server (Stage 5).
- Live numbers in the sign-in presentation panel.

## Dependencies

- Stage 2 (project skeleton, [#2](https://github.com/paulojnneto/service-desk/issues/2)): the UI, the API and the theme.

## Decisions

Resolved on 2026-10-27, all following the recommendation: a demo hint with sample emails on the sign-in screen; a welcome message with three suggestions in the empty chat; static numbers in the presentation panel; `tel:4000` and help hints instead of real password flows; sessions of 30 days with "keep me signed in" and 10 hours without; "Meu perfil" in scope.

## Open questions (resolved)

1. **Demo hint on the sign-in screen.** The prototype has an empty note area below the button. Should it list sample emails ("use ana.souza@nexo.com.br or rafael.lima@nexo.com.br, with any password")? _(Recommended: yes. Reviewers need to know which emails exist, and the note area is already in the layout.)_
2. **Welcome message and suggestions.** The prototype starts with a conversation already in progress and shows no empty state. Should the empty chat have a greeting and three suggestions ("Qual o horário do service desk?", "Como está meu chamado?", "Quero abrir um chamado")? _(Recommended: yes. It shows reviewers where to start; the suggestions that the simulated model does not handle yet answer with its simulated-mode reply until Stage 6.)_
3. **Presentation panel numbers.** The stats ("8 s", "72%", "6 analistas online") are illustrative. Keep them static? _(Recommended: yes, as in the prototype; live numbers are out of scope.)_
4. **Help links.** "Ligue no ramal 4000", "Esqueci minha senha" and "Redefinir senha" have nothing real behind them. _(Recommended: the phone link uses `tel:4000`; "Esqueci minha senha" shows a short hint that the password is the Nexo network password and IT resets it; "Redefinir senha" is disabled with the same hint.)_
5. **Session durations.** 30 days with "keep me signed in" and 10 hours without it. _(Recommended: as listed; the shorter one covers a workday without asking to sign in again at lunch.)_
6. **"Meu perfil" in scope.** The challenge does not list it, but the prototype has the frame and the sidebar links to it. _(Recommended: include it; it is a small, static screen and avoids a dead link.)_
