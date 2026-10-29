import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { secureHeaders } from "hono/secure-headers";
import { session, type AppEnv } from "./auth";
import type { TicketsClient } from "@nexo/tickets-client";
import type { Db } from "./db/connect";
import { analystRoutes } from "./routes/analyst";
import { readLimits, type Limits } from "./limits";
import { DEFAULT_RATE_LIMITS, rateLimit, type RateLimits } from "./rate-limit";
import { authRoutes } from "./routes/auth";
import { chatRoutes, runNexoAssist, type RunAgent } from "./routes/chat";
import { conversationRoutes } from "./routes/conversations";
import { draftRoutes } from "./routes/drafts";

export type AppOptions = {
  db: Db;
  // The ticket service, read by the agent and written by the draft confirmation.
  tickets: TicketsClient;
  now?: () => Date;
  // The agent run; tests replace it to fail or to inspect what the agent receives.
  runAgent?: RunAgent;
  // Usage limits; from the environment unless given (stage 11).
  limits?: Limits;
  // How long an agent turn may take (stage 11 PRD, S-11.9).
  turnDeadlineMs?: number;
  // Per-address limits on sign-in and chat; false turns them off (tests sign in many times).
  rateLimits?: RateLimits | false;
  // The built web app (apps/web/dist), served on the API's origin when set (stage 12 PRD,
  // S-12.2). Docker Compose sets it; in development Vite serves the screens.
  webDist?: string;
};

// Backend for the UI: runs the agent, so model keys never reach the browser.
// Built by a function so tests can call app.request() without opening a port.
export function createApp({
  db,
  tickets,
  now = () => new Date(),
  runAgent = runNexoAssist,
  limits = readLimits(),
  turnDeadlineMs = 60_000,
  rateLimits = DEFAULT_RATE_LIMITS,
  webDist,
}: AppOptions) {
  const app = new Hono<AppEnv>();

  app.use(securityHeaders);
  app.get("/health", (c) => c.json({ status: "ok" }));

  app.use("/api/*", async (c, next) => {
    c.set("db", db);
    c.set("tickets", tickets);
    c.set("now", now);
    c.set("runAgent", runAgent);
    c.set("limits", limits);
    c.set("turnDeadlineMs", turnDeadlineMs);
    await next();
  });
  if (rateLimits) {
    app.post("/api/auth/sign-in", rateLimit(rateLimits.signInPerMinute));
    app.post("/api/chat", rateLimit(rateLimits.chatPerMinute));
  }
  app.use("/api/*", jsonOnlyPosts, session);
  app.route("/api/auth", authRoutes);
  app.route("/api/chat", chatRoutes);
  app.route("/api/conversations", conversationRoutes);
  app.route("/api/drafts", draftRoutes);
  app.route("/api/analyst", analystRoutes);

  if (webDist) {
    // An unknown API path stays a JSON 404, not the page.
    app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));
    app.get("*", serveStatic({ root: webDist }));
    // Every other path is a screen of the router: index.html decides what to show.
    app.get("*", serveStatic({ root: webDist, path: "index.html" }));
  }

  return app;
}

// The usual security headers on every response, and a content security policy that allows
// only the app's own origin (stage 12 PRD, S-12.8). The fonts are bundled by Vite, and data:
// covers the small assets it inlines; React's style prop goes through the DOM, which
// style-src 'self' allows.
export const CONTENT_SECURITY_POLICY = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'"],
  imgSrc: ["'self'", "data:"],
  fontSrc: ["'self'", "data:"],
  connectSrc: ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  frameAncestors: ["'none'"],
  formAction: ["'self'"],
};
const securityHeaders = secureHeaders({ contentSecurityPolicy: CONTENT_SECURITY_POLICY });

// CSRF protection together with SameSite=Lax: a cross-site page cannot send a JSON
// body without a CORS preflight, and this API never approves one.
const jsonOnlyPosts = createMiddleware(async (c, next) => {
  const type = c.req.header("content-type") ?? "";
  if (c.req.method === "POST" && !type.startsWith("application/json")) {
    return c.json({ error: "unsupported_media_type" }, 415);
  }
  await next();
});
