import { existsSync } from "node:fs";

// Loads apps/tickets/.env.local before any other module reads process.env.
// It must be the first import of every entry point (server, migrate, seed).
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const DEV_DATABASE_URL = "postgres://nexo:nexo@localhost:55432/nexo_tickets";

export function databaseUrl(env = process.env): string {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  if (env.NODE_ENV === "production") throw new Error("DATABASE_URL must be set in production.");
  return DEV_DATABASE_URL;
}
