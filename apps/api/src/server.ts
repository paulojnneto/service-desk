import { databaseUrl, ticketsConfig } from "./env";
import { serve } from "@hono/node-server";
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

serve({ fetch: createApp({ db, tickets }).fetch, port }, (info) => {
  console.log(`Agent API listening on http://localhost:${info.port}`);
});
