import { handleChatStream } from "@mastra/ai-sdk";
import { createUIMessageStreamResponse } from "ai";
import { mastra } from "@nexo/agent";

export async function POST(req: Request) {
  const params = await req.json();
  const stream = await handleChatStream({
    mastra,
    agentId: "nexo-assist",
    version: "v7",
    params,
  });
  return createUIMessageStreamResponse({ stream });
}
