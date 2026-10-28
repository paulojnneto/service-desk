import { RequestContext } from "@mastra/core/request-context";

// Values the server passes to the agent on every request. Tools read the
// signed-in person from here, never from the conversation.
export type NexoContext = { userId: string };

export function requestContextFor(userId: string): RequestContext<NexoContext> {
  const context = new RequestContext<NexoContext>();
  context.set("userId", userId);
  return context;
}
