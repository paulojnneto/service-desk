# Stage 03 — Sign-in and employee shell: tech spec

|        |                                                            |
| ------ | ---------------------------------------------------------- |
| Issue  | [#3](https://github.com/paulojnneto/service-desk/issues/3) |
| PRD    | [`prd.md`](prd.md) (approved on 2026-10-27)                |
| Status | Approved (2026-10-27)                                      |

## Solution overview

Identity lives in the **API**. The UI only asks the API who is signed in and never stores identity itself.

```
Browser (apps/web)                         apps/api
┌──────────────────────────┐   /api   ┌────────────────────────────────────────────┐
│ React Router routes      │ ───────▶ │ session middleware: cookie → person         │
│  /login      (public)    │          │  POST /api/auth/sign-in   sets the cookie   │
│  /           (employee)  │          │  POST /api/auth/sign-out  clears it         │
│  /perfil     (employee)  │          │  GET  /api/auth/me        who is signed in  │
│  /console    (analyst)   │          │  POST /api/chat           employees only    │
│ loaders call /api/auth/me│ ◀─────── │                                              │
└──────────────────────────┘  cookie  └──────────────┬─────────────────────────────┘
                              (HTTP-only)            │ uses
                                                     ▼
                                           packages/shared: directory
```

1. **Sign-in:** the form posts email, password and "keep me signed in" to `/api/auth/sign-in`. The API looks the email up in the sample directory, ignores the password (PRD S-03.3) and answers with a `Set-Cookie` header. The cookie holds `{ userId, role }`, sealed (encrypted and signed) with `iron-session`, so browser code cannot read or forge it.
2. **Every API request:** a middleware unseals the cookie and loads the person from the directory. Routes declare which role they need. Nothing about identity is ever read from the request body.
3. **Every screen:** each React Router route has a loader that calls `/api/auth/me` before the screen renders, and redirects to sign-in or to the person's own area. The screen never flashes content for the wrong person (S-03.17). The loaders only improve the experience: the API is what actually protects the data.

**Fixed along the way (found while writing this spec):** today `/api/chat` passes the whole request body to `handleChatStream`. Its parameters include the agent's execution options, so a client could send its own `instructions`, `system`, `model`, `maxSteps`, `memory` or `requestContext`. That means rewriting the agent's instructions, picking an expensive model and, from Stage 5, reading another person's memory. The route now builds the parameters itself: only `messages` (and `trigger`) come from the body, and everything else comes from the server.

**Reference implementation:** the local branch `local/etapa-login-chat` has a Next.js version of these screens. Its markup and styles are reused where they match the prototype. Its server code (Server Actions, the Next.js proxy) is not reused, because that logic now lives in the Hono API.

## Files and modules

| Path                                                       | What changes                                                                               | Why                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------- |
| `packages/shared/src/directory.ts`, test                   | Sample directory (`PEOPLE`), `findPersonByEmail`, `findPersonById`, `initials`             | S-03.1, S-03.3            |
| `apps/api/src/session.ts`                                  | Seal and unseal the session cookie; set and clear it; secret and durations                 | S-03.6, S-03.7            |
| `apps/api/src/auth.ts`                                     | `session` middleware (cookie → person) and `requireRole(role)`                             | S-03.9, S-03.10           |
| `apps/api/src/routes/auth.ts`                              | `sign-in`, `sign-out`, `me`                                                                | S-03.3 to S-03.8          |
| `apps/api/src/routes/chat.ts`                              | Chat route moved out of `app.ts`, behind `requireRole("employee")`, with `buildChatParams` | S-03.9                    |
| `apps/api/src/app.ts`                                      | Mounts the middleware and the routes; JSON-only rule for `POST`                            | S-03.9                    |
| `apps/api/.env.example`                                    | `SESSION_SECRET`                                                                           | S-03.7                    |
| `apps/web/src/main.tsx`, `router.tsx`                      | React Router with the routes and their loaders                                             | S-03.10, S-03.17          |
| `apps/web/src/lib/api.ts`                                  | Small `fetch` helpers for the auth routes, and the error codes mapped to Portuguese copy   | S-03.4, S-03.14           |
| `apps/web/src/lib/guards.ts`, test                         | Loader logic: who may open which route, and where to redirect                              | S-03.10                   |
| `apps/web/src/routes/sign-in/*`                            | Screen 1: presentation panel and form                                                      | S-03.2 to S-03.5, S-03.18 |
| `apps/web/src/routes/employee/layout.tsx`, `nav-links.tsx` | Sidebar, user block, sign-out                                                              | S-03.11                   |
| `apps/web/src/routes/employee/support.tsx`                 | Top bar and chat                                                                           | S-03.11 to S-03.14        |
| `apps/web/src/routes/employee/profile.tsx`                 | "Meu perfil"                                                                               | S-03.15                   |
| `apps/web/src/routes/analyst/landing.tsx`                  | Analyst area placeholder                                                                   | S-03.16                   |
| `apps/web/src/components/chat/*`                           | The chat from `app.tsx`, split into messages, composer, welcome and errors                 | S-03.12 to S-03.14        |
| `apps/web/src/components/{nexo-mark,top-bar}.tsx`          | Logo from `nexo.pen` and the top bar                                                       | S-03.2, S-03.11           |
| `apps/web/src/app.tsx`                                     | Removed; its chat moves to `components/chat`                                               | —                         |
| `README.md`                                                | How to sign in, `SESSION_SECRET`                                                           | N7                        |

## Decisions

| Decision                       | Choice                                                                                                                                                                       | Alternatives considered                                                                   | Reason                                                                                                                                                                                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session mechanism              | Stateless cookie sealed with `iron-session` (`sealData`/`unsealData`), set with Hono's cookie helpers                                                                        | Hono signed cookies; a JWT; a session table on the server                                 | Signed cookies and JWTs are readable (base64), and the PRD asks for content that cannot be read (S-03.7). A server-side table needs persistence, which arrives in Stage 5. The trade-off: a sealed cookie cannot be revoked before it expires |
| Cookie settings                | `nexo_session`, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production, `Max-Age` of 30 days or 10 hours                                                               | A browser-session cookie without `Max-Age` when "keep me signed in" is off                | A browser-session cookie can live for weeks when browsers restore tabs; a fixed 10-hour `Max-Age` matches the PRD exactly                                                                                                                     |
| Session secret                 | `SESSION_SECRET` (at least 32 characters) in `apps/api/.env.local`; a fixed development secret when it is missing outside production; startup fails in production without it | Always required                                                                           | Keeps "clone and run" working (N7) while production cannot start with a known secret                                                                                                                                                          |
| CSRF protection                | `SameSite=Lax` plus a rule that every `POST` must be `application/json`                                                                                                      | CSRF tokens                                                                               | A cross-site page cannot send a JSON body without a CORS preflight, which the API never approves, and `Lax` keeps the cookie off cross-site `POST`s. Tokens add moving parts for no extra protection here                                     |
| Where the directory lives      | `packages/shared`                                                                                                                                                            | Inside `apps/api`                                                                         | The ticket service (Stage 4) needs the same people IDs as requesters                                                                                                                                                                          |
| API errors                     | Stable codes (`unknown_email`, `invalid_input`, `unauthenticated`, `forbidden`); the UI owns the Portuguese copy                                                             | Messages in Portuguese from the API                                                       | Copy changes stay in the UI, and tests assert on codes, not on wording                                                                                                                                                                        |
| Chat parameters                | `buildChatParams(body, person)` keeps only `messages` and `trigger` from the body; the person's ID goes into `requestContext` from the session                               | Passing the body through (current code); validating the body against the full Mastra type | Closes the hole described above. The person's ID in `requestContext` is what the Stage 4 tools will read                                                                                                                                      |
| Routing                        | React Router 8 in data mode (`createBrowserRouter`, loaders, `redirect`)                                                                                                     | TanStack Router; hand-written routing                                                     | The most widely known React router; loaders run before a screen renders, which is what removes the flashing (S-03.17)                                                                                                                         |
| Session state in the UI        | Route loaders call `/api/auth/me`; layouts read the result with `useLoaderData`                                                                                              | A React context filled by a `useEffect`                                                   | A `useEffect` renders first and checks later, which is exactly the flash the PRD forbids                                                                                                                                                      |
| Sign-in and sign-out in the UI | React Router route actions (`<Form method="post">`, `useNavigation` for the pending state)                                                                                   | `fetch` plus local `useState`                                                             | The router already knows when an action is pending (S-03.5) and revalidates the loaders after sign-in and sign-out                                                                                                                            |
| Expired session in the chat    | The chat detects a 401 from `/api/chat` and shows the message with a link to sign-in                                                                                         | Redirecting immediately                                                                   | The employee does not lose the message they were typing without seeing why                                                                                                                                                                    |
| UI tests                       | Unit tests for the guard logic (pure functions, no DOM)                                                                                                                      | React Testing Library for the screens                                                     | The guards are where a mistake leaks a screen to the wrong person. Screen tests would mostly check markup that changes in Stage 7                                                                                                             |

## Contracts

**API**

| Method | Path                 | Request                                                  | Responses                                                                                         |
| ------ | -------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| POST   | `/api/auth/sign-in`  | `{ email: string, password: string, remember: boolean }` | `200 { user }` + `Set-Cookie`; `400 { error: "invalid_input" }`; `401 { error: "unknown_email" }` |
| POST   | `/api/auth/sign-out` | `{}`                                                     | `204` + cookie cleared                                                                            |
| GET    | `/api/auth/me`       | —                                                        | `200 { user }`; `401 { error: "unauthenticated" }`                                                |
| POST   | `/api/chat`          | `{ messages, trigger? }` (other fields ignored)          | Stream as in Stage 2; `401 { error: "unauthenticated" }`; `403 { error: "forbidden" }`            |
| POST   | any                  | Body that is not `application/json`                      | `415 { error: "unsupported_media_type" }`                                                         |

`user` is the narrow view the UI needs:

```ts
type SessionUser = {
  id: string;
  role: "employee" | "analyst";
  name: string;
  firstName: string;
  email: string;
  initials: string;
};
```

**`@nexo/shared`**

```ts
type Person = Employee | Analyst; // employee: department; analyst: level "N1" | "N2"; both: avatar colors
const PEOPLE: readonly Person[]; // 7 employees and 2 analysts from the prototype
function findPersonByEmail(email: string): Person | undefined; // trims and ignores case
function findPersonById(id: string): Person | undefined;
function initials(name: string): string; // first and last name
```

**Routes in the UI**

| Path       | Who        | Otherwise                                           |
| ---------- | ---------- | --------------------------------------------------- |
| `/login`   | Signed out | Signed in → own area                                |
| `/`        | Employee   | Signed out → `/login`; analyst → `/console`         |
| `/perfil`  | Employee   | Same as `/`                                         |
| `/console` | Analyst    | Signed out → `/login`; employee → `/`               |
| other      | —          | Redirect to `/`, which then applies the rules above |

**Environment variables (new)**

| App | Variable         | Default                               | Purpose                  |
| --- | ---------------- | ------------------------------------- | ------------------------ |
| api | `SESSION_SECRET` | Development secret outside production | Seals the session cookie |

## Error handling

| Failure                                         | What the person sees                                                                    | In the API log                  |
| ----------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------- |
| Unknown email                                   | "Não encontramos esse e-mail. Use seu e-mail corporativo @nexo.com.br." The email stays | —                               |
| Empty field                                     | "Informe seu e-mail corporativo." / "Informe sua senha."                                | —                               |
| API down during sign-in                         | "Não foi possível entrar agora. Tente de novo em instantes."                            | —                               |
| API down when a screen loads                    | A full-page error with a "Tentar de novo" button (route error boundary)                 | —                               |
| Cookie expired, tampered or with a wrong secret | Treated as signed out: redirect to sign-in                                              | —                               |
| Session expires while chatting                  | "Sua sessão expirou." with a link to sign-in                                            | —                               |
| Analyst calls the chat API                      | Not reachable from the UI; the API answers 403                                          | —                               |
| `SESSION_SECRET` missing in production          | The API does not start                                                                  | The reason, naming the variable |

## Test plan

| What                                                                                                                                    | Type                        | Why it is worth testing                        |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------- |
| `findPersonByEmail` trims and ignores case; unknown emails return nothing; `initials`                                                   | Unit                        | The sign-in rule (S-03.3)                      |
| Sign-in sets an HTTP-only cookie whose value contains neither the email nor the name                                                    | Integration (`app.request`) | S-03.7                                         |
| Sign-in with an unknown email answers 401 `unknown_email`; with empty fields, 400 `invalid_input`                                       | Integration                 | S-03.4                                         |
| `me` with the cookie returns the user; without it, 401; with a tampered cookie, 401                                                     | Integration                 | The middleware cannot be fooled                |
| Sign-out clears the cookie, and `me` with the old request answers 401                                                                   | Integration                 | S-03.8                                         |
| Chat: 401 without a session, 403 for an analyst, the stream for an employee                                                             | Integration                 | S-03.9                                         |
| `buildChatParams` drops `instructions`, `model`, `maxSteps`, `memory` and `requestContext` from the body and sets the session's user ID | Unit                        | The security fix                               |
| `POST` with a non-JSON body answers 415                                                                                                 | Integration                 | CSRF rule                                      |
| Guards: each route with no session, an employee and an analyst                                                                          | Unit (pure functions)       | S-03.10: the matrix that decides who sees what |

**Manual validation of the acceptance criteria** (browser, 1440×900, with the prototype screenshots side by side)

1. Sign in as `ana.souza@nexo.com.br` and as `rafael.lima@nexo.com.br` with any password; then as `ANA.SOUZA@nexo.com.br ` (case and trailing space).
2. Unknown email and empty fields: check the messages and that the email stays.
3. Reload; sign out; press the browser's back button.
4. Without a session, open `/`, `/perfil` and `/console`; call `POST /api/chat` from the browser console.
5. As an analyst, call `POST /api/chat` and open `/`; as an employee, open `/console`.
6. Inspect the cookie in the browser's dev tools (HTTP-only) and try `document.cookie`.
7. Empty chat: greeting by first name; click a suggestion; watch the counter.
8. Stop the API while chatting, then sign in again and delete the cookie mid-conversation.
9. Compare sign-in, support screen and profile with the screenshots; shrink the window below 1280 px.

## Commit plan

1. `docs(stage-03): approved PRD for sign-in and the employee shell` (done)
2. `docs(stage-03): tech spec for sign-in and the employee shell`
3. `feat(shared): sample directory of employees and analysts`
4. `feat(api): sealed session cookie with sign-in, sign-out and me routes`
5. `fix(api): build the chat parameters on the server and require an employee session`
6. `feat(web): routes with role guards (React Router)`
7. `feat(web): sign-in screen`
8. `feat(web): employee shell with the chat`
9. `feat(web): profile screen and analyst landing`
10. `docs: sign-in and session in the README`

Then a pull request "Stage 03 — Sign-in and employee shell" with `Closes #3`.

## Risks

| Risk                                                                 | Mitigation                                                                                                      |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| React Router 8 APIs differ from the ones I know (v6 and v7)          | Read the documentation bundled with the installed version before writing the router; record any difference here |
| `iron-session` was designed around Node and Next.js request objects  | Only `sealData` and `unsealData` are used, which work on plain strings; the cookie itself is handled by Hono    |
| A sealed cookie cannot be revoked before it expires                  | Documented trade-off; revisit if Stage 5 adds a session table                                                   |
| The fix to the chat parameters changes behavior that Stage 2 shipped | It is a security fix with its own commit and test, and it is called out in the PR                               |
| Pixel fidelity takes many small adjustments                          | Validate against the screenshots at 1440×900, using the spacing values extracted from `nexo.pen`                |
