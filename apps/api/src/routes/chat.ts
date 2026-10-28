import { randomUUID } from "node:crypto";
import { handleChatStream } from "@mastra/ai-sdk";
import { mastra, requestContextFor } from "@nexo/agent";
import {
  MAX_MESSAGE_LENGTH,
  MESSAGES_PER_SESSION,
  type Person,
  type StoredMessage,
} from "@nexo/shared";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { Hono } from "hono";
import { z } from "zod";
import { requireRole, type AppEnv } from "../auth";
import {
  appendEmployeeMessage,
  appendMessage,
  listMessages,
  type AppendResult,
} from "../conversations/repository";
import { toAgentHistory } from "../conversations/to-ui";

// The client sends only the new message (stage 5 PRD, S-05.6). The history the agent
// reads always comes from the database, so a client cannot invent past messages.
const ChatBody = z.object({
  message: z.object({
    id: z.string().min(1).max(100),
    parts: z.array(z.looseObject({ type: z.string() })),
  }),
});

export type ChatInput = { clientId: string; parts: [{ type: "text"; text: string }] };

// Keeps only the text the employee typed: any other part type is dropped.
export function parseChatBody(body: unknown): ChatInput | null {
  const parsed = ChatBody.safeParse(body);
  if (!parsed.success) return null;
  const text = parsed.data.message.parts
    .flatMap((part) => (part.type === "text" && typeof part.text === "string" ? [part.text] : []))
    .join("\n")
    .trim();
  if (!text || text.length > MAX_MESSAGE_LENGTH) return null;
  return { clientId: parsed.data.message.id, parts: [{ type: "text", text }] };
}

// Everything the agent runs with is decided here, on the server: the stored history and
// the person from the session. handleChatStream also accepts execution options
// (instructions, model, memory...), and none of them come from the client.
export function buildChatParams(history: StoredMessage[], person: Person) {
  return {
    messages: history as unknown as UIMessage[],
    requestContext: requestContextFor(person.id),
  };
}

export type ChatParams = ReturnType<typeof buildChatParams>;
export type RunAgent = (params: ChatParams) => Promise<ReadableStream<UIMessageChunk>>;

export const runNexoAssist: RunAgent = (params) =>
  handleChatStream({ mastra, agentId: "nexo-assist", version: "v7", params }) as Promise<
    ReadableStream<UIMessageChunk>
  >;

export const chatRoutes = new Hono<AppEnv>()
  // Saves the employee's message, then streams the agent's reply (AI SDK UI format,
  // consumed by useChat) and saves it when it ends.
  .post("/", requireRole("employee"), async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const input = parseChatBody(body);
    if (!input) return c.json({ error: "invalid_input" }, 400);

    const db = c.get("db");
    const now = c.get("now");
    // requireRole guarantees the person; the non-null assertion only satisfies the type.
    const person = c.get("person")!;

    let saved: AppendResult;
    let history: Awaited<ReturnType<typeof listMessages>>;
    try {
      saved = await appendEmployeeMessage(db, person.id, input, now());
      if (saved.status === "limit_reached") {
        return c.json({ error: "message_limit_reached", limit: MESSAGES_PER_SESSION }, 409);
      }
      history = await listMessages(db, saved.conversation.id);
    } catch (error) {
      console.error("Could not save the message:", error);
      return c.json({ error: "unavailable" }, 503);
    }

    // A resend after the reply was saved (another tab, a late retry) gets nothing new.
    if (history.at(-1)?.author !== "employee") {
      return c.json({ error: "already_answered" }, 409);
    }

    // With an analyst, or waiting for one, the agent stays quiet (S-05.12).
    const { state } = saved.conversation;
    if (state !== "with_agent") {
      const stream = createUIMessageStream({
        execute: ({ writer }) => {
          writer.write({ type: "data-conversation-state", data: { state }, transient: true });
        },
      });
      return createUIMessageStreamResponse({ stream });
    }

    const agentHistory = toAgentHistory(history);
    let reply: ReadableStream<UIMessageChunk>;
    try {
      reply = await c.get("runAgent")(buildChatParams(agentHistory, person));
    } catch (error) {
      // The message stays saved; the UI's retry sends it again without counting it twice.
      console.error("The agent could not start:", error);
      return c.json({ error: "unavailable" }, 503);
    }

    // Only a reply that reached its end without an error chunk is saved; an incomplete
    // one is dropped, and the retry produces a clean one (S-05.8).
    let ended = false;
    let failed = false;
    const watched = reply.pipeThrough(
      new TransformStream<UIMessageChunk, UIMessageChunk>({
        transform(chunk, controller) {
          if (chunk.type === "error") failed = true;
          controller.enqueue(chunk);
        },
        flush() {
          ended = true;
        },
      }),
    );

    const stream = createUIMessageStream({
      originalMessages: agentHistory as unknown as UIMessage[],
      generateId: randomUUID,
      execute: ({ writer }) => writer.merge(watched),
      onEnd: async ({ responseMessage, isAborted }) => {
        if (!ended || failed || isAborted) return;
        try {
          await appendMessage(
            db,
            person.id,
            { id: responseMessage.id, author: "agent", parts: responseMessage.parts },
            now(),
          );
        } catch (error) {
          console.error("Could not save the agent's reply:", error);
        }
      },
    });

    // Draining a copy on the server keeps the reply going, and saved, even if the
    // browser closes mid-reply.
    return createUIMessageStreamResponse({
      stream,
      consumeSseStream: async ({ stream: copy }) => {
        const reader = copy.getReader();
        while (!(await reader.read()).done);
      },
    });
  });
