import { handleChatStream } from "@mastra/ai-sdk";
import { mastra, requestContextFor } from "@nexo/agent";
import type { Person } from "@nexo/shared";
import { createUIMessageStreamResponse, type UIMessage } from "ai";
import { Hono } from "hono";
import { z } from "zod";
import { requireRole, type AppEnv } from "../auth";

// Only these fields come from the client. handleChatStream also accepts the agent's
// execution options (instructions, model, maxSteps, memory, requestContext...), so
// passing the body through would let a client rewrite the agent.
const ChatBody = z.object({
  messages: z.array(
    z.looseObject({ id: z.string(), role: z.string(), parts: z.array(z.unknown()) }),
  ),
  trigger: z.enum(["submit-message", "regenerate-message"]).optional(),
});

export function buildChatParams(body: unknown, person: Person) {
  const parsed = ChatBody.safeParse(body);
  if (!parsed.success) return null;
  return {
    messages: parsed.data.messages as unknown as UIMessage[],
    ...(parsed.data.trigger ? { trigger: parsed.data.trigger } : {}),
    requestContext: requestContextFor(person.id),
  };
}

export const chatRoutes = new Hono<AppEnv>()
  // Streams the agent's reply in the AI SDK UI format that useChat consumes.
  .post("/", requireRole("employee"), async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    // requireRole guarantees the person; the non-null assertion only satisfies the type.
    const params = buildChatParams(body, c.get("person")!);
    if (!params) return c.json({ error: "invalid_input" }, 400);

    const stream = await handleChatStream({
      mastra,
      agentId: "nexo-assist",
      version: "v7",
      params,
    });
    return createUIMessageStreamResponse({ stream });
  });
