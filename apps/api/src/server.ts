import { databaseUrl, ticketsConfig } from "./env";
import { serve } from "@hono/node-server";
import { modelName, providerKeyName } from "@nexo/agent";
import { createServiceTokenSigner, createTicketsClient } from "@nexo/tickets-client";
import { createApp } from "./app";
import { connect } from "./db/connect";

const port = Number(process.env.PORT ?? 3001);

// The pool connects lazily: the API starts without the database and answers 503 until it is up.
const { db } = connect(databaseUrl());

let tickets: ReturnType<typeof createTicketsClient>;
try {
  const config = ticketsConfig();
  tickets = createTicketsClient({
    baseUrl: config.baseUrl,
    signToken: createServiceTokenSigner(config.privateKeyPem),
  });
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}

serve({ fetch: createApp({ db, tickets, webDist: process.env.WEB_DIST }).fetch, port }, (info) => {
  console.log(`Agent API listening on http://localhost:${info.port}`);
  // Which model answers, so a run with Docker Compose shows whether the key was picked up.
  const model = modelName();
  console.log(`Agent model: ${model === "mock" ? "mock (simulated, no key needed)" : model}`);
  // A real model without its key fails every reply; say so now rather than in each chat turn.
  const key = providerKeyName();
  if (key && !process.env[key]) {
    console.warn(
      `${key} is not set, so every agent reply will fail. Set it in .env (Docker) or apps/api/.env.local, or set NEXO_AGENT_MODEL=mock.`,
    );
  }
});
