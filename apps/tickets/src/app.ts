import { Hono } from "hono";
import type { CryptoKey } from "jose";
import type { Db } from "./db/connect";
import type { TicketsEnv } from "./env-types";
import { idempotency } from "./middleware/idempotency";
import { serviceToken } from "./middleware/service-token";
import { articleRoutes } from "./routes/articles";
import { ticketRoutes } from "./routes/tickets";

export type AppOptions = {
  db: Db;
  tokenPublicKey: CryptoKey;
  now?: () => Date;
};

// Simulated ticket service (the "legacy system"), separate from the agent.
// The app is built by a function so tests can call app.request() without opening a port.
export function createApp({ db, tokenPublicKey, now = () => new Date() }: AppOptions) {
  const app = new Hono<TicketsEnv>();

  app.get("/health", (c) => c.json({ status: "ok" }));

  // Everything else needs a token from the API.
  const api = new Hono<TicketsEnv>();
  api.use(async (c, next) => {
    c.set("db", db);
    c.set("now", now);
    await next();
  });
  api.use(serviceToken(tokenPublicKey));
  api.use(idempotency);
  api.route("/tickets", ticketRoutes);
  api.route("/articles", articleRoutes);

  app.route("/", api);
  return app;
}
