import { handleChatStream } from "@mastra/ai-sdk";
import { mastra } from "@nexo/agent";
import { createUIMessageStreamResponse } from "ai";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { session, type AppEnv } from "./auth";
import { authRoutes } from "./routes/auth";

// Backend for the UI: runs the agent, so model keys never reach the browser.
// Built by a function so tests can call app.request() without opening a port.
export function createApp() {
  const app = new Hono<AppEnv>();

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.use("/api/*", jsonOnlyPosts, session);
  app.route("/api/auth", authRoutes);

  // Streams the agent's reply in the AI SDK UI format that useChat consumes.
  app.post("/api/chat", async (c) => {
    let params;
    try {
      params = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    const stream = await handleChatStream({
      mastra,
      agentId: "nexo-assist",
      version: "v7",
      params,
    });
    return createUIMessageStreamResponse({ stream });
  });

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
