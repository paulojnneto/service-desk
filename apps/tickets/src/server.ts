import { databaseUrl, tokenPublicKey } from "./env";
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { connect } from "./db/connect";

const port = Number(process.env.PORT ?? 4000);

const publicKey = await tokenPublicKey().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});

const { db } = connect(databaseUrl());

serve({ fetch: createApp({ db, tokenPublicKey: publicKey }).fetch, port }, (info) => {
  console.log(`Ticket service listening on http://localhost:${info.port}`);
});
