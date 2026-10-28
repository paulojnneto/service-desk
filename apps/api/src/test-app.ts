import { createApp, type AppOptions } from "./app";
import type { Db } from "./db/connect";
import { createTestDb, resetTestDb } from "./db/test-db";

// One in-process database per test file, emptied before each app is built.
let shared: Promise<Db> | undefined;

// The API over an empty test database (or over the given one), for tests.
export async function createTestApp(options: Partial<AppOptions> = {}) {
  let db = options.db;
  if (!db) {
    shared ??= createTestDb();
    db = await shared;
    await resetTestDb(db);
  }
  return { app: createApp({ ...options, db }), db };
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
