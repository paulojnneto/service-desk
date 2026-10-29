import { createApp as createTicketsApp } from "@nexo/tickets/src/app";
import { createTestDb as createTicketsDb } from "@nexo/tickets/src/db/test-db";
import { seedDatabase } from "@nexo/tickets/src/seed/seed";
import { testKeys } from "@nexo/tickets/src/test-tokens";
import {
  createServiceTokenSigner,
  createTicketsClient,
  type TicketsClient,
} from "@nexo/tickets-client";
import { exportPKCS8 } from "jose";
import { createApp, type AppOptions } from "./app";
import type { Db } from "./db/connect";
import { createTestDb, resetTestDb } from "./db/test-db";

// One in-process database per test file, emptied before each app is built.
let shared: Promise<Db> | undefined;

// The API over an empty test database (or over the given one), for tests. The ticket service
// is the real one, in process, with the Annex B sample data (stage 6 tech spec).
export async function createTestApp(options: Partial<AppOptions> = {}) {
  let db = options.db;
  if (!db) {
    shared ??= createTestDb();
    db = await shared;
    await resetTestDb(db);
  }
  const tickets = options.tickets ?? (await testTickets()).client;
  // Tests sign in many times from one address; the rate-limit tests turn it on themselves.
  return { app: createApp({ rateLimits: false, ...options, db, tickets }), db, tickets };
}

let ticketsService: Promise<TestTickets> | undefined;
type TestTickets = { client: TicketsClient; reseed: () => Promise<unknown>; down: Down };
type Down = { value: boolean };

// The ticket service in process, seeded once per test file. `down.value = true` makes it
// answer 503, like the legacy outages; the client gives up at once in tests.
export function testTickets(): Promise<TestTickets> {
  ticketsService ??= (async () => {
    const db = await createTicketsDb();
    await seedDatabase(db);
    const keys = await testKeys();
    const app = createTicketsApp({ db, tokenPublicKey: keys.publicKey });
    const down: Down = { value: false };
    const client = createTicketsClient({
      baseUrl: "http://tickets",
      signToken: createServiceTokenSigner(await exportPKCS8(keys.privateKey)),
      retry: { delaysMs: [], timeoutMs: 5000 },
      fetch: (async (url: string, init?: RequestInit) =>
        down.value
          ? new Response(JSON.stringify({ error: "unavailable" }), { status: 503 })
          : app.fetch(new Request(url, init))) as typeof fetch,
    });
    return { client, reseed: () => seedDatabase(db), down };
  })();
  return ticketsService;
}

type App = ReturnType<typeof createApp>;

export function postJson(app: App, path: string, body: unknown, cookie?: string) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

// Signs in with any password and returns the response, the Set-Cookie header and the cookie.
export async function signIn(app: App, email: string, remember = false) {
  const res = await postJson(app, "/api/auth/sign-in", { email, password: "anything", remember });
  const setCookie = res.headers.get("set-cookie") ?? "";
  return { res, setCookie, cookie: setCookie.split(";")[0] ?? "" };
}
