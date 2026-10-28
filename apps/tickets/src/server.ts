import { databaseUrl, tokenPublicKey } from "./env";
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { connect } from "./db/connect";
import { instabilityFromEnv } from "./middleware/instability";

const port = Number(process.env.PORT ?? 4000);

const publicKey = await tokenPublicKey().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});

const { db } = connect(databaseUrl());
const legacy = instabilityFromEnv();

serve(
  { fetch: createApp({ db, tokenPublicKey: publicKey, instability: legacy }).fetch, port },
  (info) => {
    console.log(`Ticket service listening on http://localhost:${info.port}`);
    console.log(
      `Simulated legacy instability: up to ${legacy.latencyMs} ms of latency, ` +
        `${legacy.outageRate * 100}% chance of a ${legacy.outageSeconds} s outage per request`,
    );
  },
);
