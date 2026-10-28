import { handleChatStream } from "@mastra/ai-sdk";
import { mastra } from "@nexo/agent";
import { createUIMessageStreamResponse } from "ai";
import { Hono } from "hono";

// Backend for the UI: runs the agent, so model keys never reach the browser.
// Built by a function so tests can call app.request() without opening a port.
export function createApp() {
  const app = new Hono();

  app.get("/health", (c) => c.json({ status: "ok" }));

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
