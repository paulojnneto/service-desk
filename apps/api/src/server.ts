import { databaseUrl } from "./env";
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { connect } from "./db/connect";

const port = Number(process.env.PORT ?? 3001);

// The pool connects lazily: the API starts without the database and answers 503 until it is up.
const { db } = connect(databaseUrl());

serve({ fetch: createApp({ db }).fetch, port }, (info) => {
  console.log(`Agent API listening on http://localhost:${info.port}`);
});
