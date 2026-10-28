import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { session, type AppEnv } from "./auth";
import type { TicketsClient } from "@nexo/tickets-client";
import type { Db } from "./db/connect";
import { authRoutes } from "./routes/auth";
import { chatRoutes, runNexoAssist, type RunAgent } from "./routes/chat";
import { conversationRoutes } from "./routes/conversations";

export type AppOptions = {
  db: Db;
  // The ticket service, read by the agent and written by the draft confirmation.
  tickets: TicketsClient;
  now?: () => Date;
  // The agent run; tests replace it to fail or to inspect what the agent receives.
  runAgent?: RunAgent;
};

// Backend for the UI: runs the agent, so model keys never reach the browser.
// Built by a function so tests can call app.request() without opening a port.
export function createApp({
  db,
  tickets,
  now = () => new Date(),
  runAgent = runNexoAssist,
}: AppOptions) {
  const app = new Hono<AppEnv>();

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.use("/api/*", async (c, next) => {
    c.set("db", db);
    c.set("tickets", tickets);
    c.set("now", now);
    c.set("runAgent", runAgent);
    await next();
  });
  app.use("/api/*", jsonOnlyPosts, session);
  app.route("/api/auth", authRoutes);
  app.route("/api/chat", chatRoutes);
  app.route("/api/conversations", conversationRoutes);

  return app;
}

// CSRF protection together with SameSite=Lax: a cross-site page cannot send a JSON
// body without a CORS preflight, and this API never approves one.
const jsonOnlyPosts = createMiddleware(async (c, next) => {
  const type = c.req.header("content-type") ?? "";
  if (c.req.method === "POST" && !type.startsWith("application/json")) {
    return c.json({ error: "unsupported_media_type" }, 415);
  }
  await next();
});
