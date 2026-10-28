import { existsSync } from "node:fs";
import { decodePem } from "@nexo/tickets-client";

// Loads apps/api/.env.local before any other module reads process.env.
// It must be the first import of every entry point (server, migrate): the agent picks its model on import.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const DEV_DATABASE_URL = "postgres://nexo:nexo@localhost:55432/nexo_api";

export function databaseUrl(env = process.env): string {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  if (env.NODE_ENV === "production") throw new Error("DATABASE_URL must be set in production.");
  return DEV_DATABASE_URL;
}

// The ticket service and the key that signs its tokens (stage 4 PRD, decision 8). Required
// from Stage 6: the agent's tools and the draft confirmation call the service.
export function ticketsConfig(env = process.env) {
  const privateKey = env.TICKETS_JWT_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("TICKETS_JWT_PRIVATE_KEY is missing. Run `pnpm bootstrap` to create the keys.");
  }
  return {
    baseUrl: env.TICKETS_URL ?? "http://localhost:4000",
    privateKeyPem: decodePem(privateKey),
  };
}
