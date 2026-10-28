import { existsSync } from "node:fs";
import { SERVICE_TOKEN } from "@nexo/shared";
import { importSPKI } from "jose";

// Loads apps/tickets/.env.local before any other module reads process.env.
// It must be the first import of every entry point (server, migrate, seed).
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const DEV_DATABASE_URL = "postgres://nexo:nexo@localhost:55432/nexo_tickets";

export function databaseUrl(env = process.env): string {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  if (env.NODE_ENV === "production") throw new Error("DATABASE_URL must be set in production.");
  return DEV_DATABASE_URL;
}

// The API's public key for the service tokens, as base64 of a PEM (written by `pnpm bootstrap`).
export async function tokenPublicKey(env = process.env) {
  const encoded = env.TICKETS_JWT_PUBLIC_KEY;
  if (!encoded) {
    throw new Error("TICKETS_JWT_PUBLIC_KEY is missing. Run `pnpm bootstrap` to create the keys.");
  }
  return importSPKI(Buffer.from(encoded, "base64").toString("utf8"), SERVICE_TOKEN.algorithm);
}
