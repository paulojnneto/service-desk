import { randomUUID } from "node:crypto";
import { handleChatStream } from "@mastra/ai-sdk";
import {
  buildDecisionRecord,
  mastra,
  modelName,
  requestContextFor,
  type AgentServices,
  type AgentUsage,
} from "@nexo/agent";
import {
  MAX_MESSAGE_LENGTH,
  MESSAGES_PER_SESSION,
  type Confidence,
  estimateCost,
  type DecisionRecord,
  type DraftView,
  type Person,
  type StoredMessage,
} from "@nexo/shared";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  readUIMessageStream,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { Hono } from "hono";
import { z } from "zod";
import { buildAgentServices } from "../agent-services";
import { requireRole, type AppEnv } from "../auth";
import {
  appendEmployeeMessage,
  appendMessage,
  handOffConversation,
  usageSince,
  lastConfidence,
  listMessages,
  type AppendResult,
} from "../conversations/repository";
import { toAgentHistory, toStoredMessage } from "../conversations/to-ui";
import type { Db } from "../db/connect";
import {
  asksForPerson,
  HANDOFF_PAST_LIMIT_TEXT,
  LIMIT_TEXT,
  limitReached,
  startOfDay,
  type LimitReached,
} from "../limits";
import { findWaitingDraft, toDraftView } from "../drafts/repository";
import { logError } from "../log";

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

// Everything the agent runs with is decided here, on the server: the stored history, the
// person from the session and the services built for them. handleChatStream also accepts
// execution options (instructions, model, memory...), and none of them come from the client.
export function buildChatParams(
  history: StoredMessage[],
  person: Person,
  services: AgentServices,
  // Confidence of the previous reply (S-06.15) and the draft waiting for "Confirmar" (stage 7).
  // The turn's usage goes to recordUsage when it finishes (stage 11).
  extra: {
    previousConfidence?: Confidence;
    waitingDraft?: DraftView;
    recordUsage?: (usage: AgentUsage) => void;
    // Ends the turn at its deadline (stage 11 PRD, S-11.9).
    abortSignal?: AbortSignal;
  } = {},
) {
  return {
    messages: history as unknown as UIMessage[],
    ...(extra.abortSignal ? { abortSignal: extra.abortSignal } : {}),
    // One retry of a rate limit, a 5xx or a network error, done by the AI SDK (S-11.9).
    modelSettings: { maxRetries: 1 },
    requestContext: requestContextFor({
      userId: person.id,
      firstName: person.name.split(" ")[0] ?? person.name,
      services,
      ...(extra.previousConfidence ? { previousConfidence: extra.previousConfidence } : {}),
      ...(extra.waitingDraft ? { waitingDraft: extra.waitingDraft } : {}),
      ...(extra.recordUsage ? { recordUsage: extra.recordUsage } : {}),
    }),
  };
}

export type ChatParams = ReturnType<typeof buildChatParams>;
export type RunAgent = (params: ChatParams) => Promise<ReadableStream<UIMessageChunk>>;

export const runNexoAssist: RunAgent = (params) =>
  handleChatStream({ mastra, agentId: "nexo-assist", version: "v7", params }) as Promise<
    ReadableStream<UIMessageChunk>
  >;

// The fixed reply past a limit, stored and streamed like an agent reply. A request for a person
// still hands off (PRD decision 7): an employee is never cut off from the service desk.
async function answerPastLimit(
  db: Db,
  employeeId: string,
  conversationId: string,
  reached: LimitReached,
  said: string,
  at: Date,
) {
  const handOff = asksForPerson(said);
  if (handOff) {
    await handOffConversation(
      db,
      conversationId,
      {
        reason: "pedido_do_funcionario",
        summary:
          `Pedido de analista com o assistente pausado pelo limite de uso. Mensagem: ${said}`.slice(
            0,
            1000,
          ),
        ticketNumber: null,
      },
      at,
    );
  }
  const decision: DecisionRecord = {
    intent: handOff ? "falar_com_analista" : "outro",
    action: handOff ? "transferiu" : "limite_de_uso",
    confidence: "alta",
    rationale: handOff
      ? "O assistente está pausado pelo limite de uso; a pessoa pediu um analista, então a conversa foi transferida sem o modelo."
      : reached === "budget"
        ? "O orçamento diário do assistente foi atingido; a resposta é fixa, sem o modelo."
        : "A pessoa atingiu o limite diário de mensagens com o assistente; a resposta é fixa, sem o modelo.",
    rules: [],
    enforcedRules: handOff ? ["R6"] : [],
    tools: handOff ? [{ name: "transferirParaAnalista", outcome: "ok" }] : [],
    source: "server",
    registered: true,
  };
  const text = handOff ? HANDOFF_PAST_LIMIT_TEXT : LIMIT_TEXT[reached];
  const row = await appendMessage(
    db,
    employeeId,
    { author: "agent", parts: [{ type: "text", text }], decision },
    at,
  );
  const stored = row ? toStoredMessage(row) : null;
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: "start", ...(stored ? { messageId: stored.id } : {}) });
      writer.write({ type: "text-start", id: "limit" });
      writer.write({ type: "text-delta", id: "limit", delta: text });
      writer.write({ type: "text-end", id: "limit" });
      if (stored) {
        writer.write({
          type: "message-metadata",
          messageMetadata: { ...stored.metadata, decision },
        });
      }
      if (handOff) {
        writer.write({
          type: "data-conversation-state",
          data: { state: "waiting_analyst" },
          transient: true,
        });
      }
      writer.write({ type: "finish" });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

function replyUsage(usage: AgentUsage, durationMs: number) {
  const model = modelName();
  return {
    model,
    modelCalls: usage.steps,
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    outputTokens: usage.outputTokens,
    durationMs,
    costUsd: estimateCost(model, usage),
  };
}

// The reply as the AI SDK assembles it from the chunks, or undefined if that fails.
async function lastMessage(stream: ReadableStream<UIMessageChunk>) {
  let last: UIMessage | undefined;
  try {
    for await (const message of readUIMessageStream({ stream })) last = message;
  } catch (error) {
    logError("Could not assemble the agent's reply:", error);
  }
  return last;
}

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
    let previousConfidence: Confidence | undefined;
    let waitingDraft: DraftView | undefined;
    try {
      saved = await appendEmployeeMessage(db, person.id, input, now());
      if (saved.status === "limit_reached") {
        return c.json({ error: "message_limit_reached", limit: MESSAGES_PER_SESSION }, 409);
      }
      history = await listMessages(db, saved.conversation.id);
      previousConfidence = await lastConfidence(db, saved.conversation.id);
      const draft = await findWaitingDraft(db, saved.conversation.id);
      waitingDraft = draft ? toDraftView(draft) : undefined;
    } catch (error) {
      logError("Could not save the message:", error);
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

    // Past a usage limit the server answers, without the model (stage 11 PRD, S-11.6, S-11.7).
    try {
      const reached = limitReached(
        await usageSince(db, person.id, startOfDay(now())),
        c.get("limits"),
      );
      if (reached) {
        const text = input.parts[0].text;
        return await answerPastLimit(db, person.id, saved.conversation.id, reached, text, now());
      }
    } catch (error) {
      logError("Could not check the usage limits:", error);
      return c.json({ error: "unavailable" }, 503);
    }

    const agentHistory = toAgentHistory(history);
    const services = buildAgentServices({
      db,
      tickets: c.get("tickets"),
      employeeId: person.id,
      conversationId: saved.conversation.id,
      now,
    });
    // The usage of this turn only, even when other turns run at the same time (S-11.1).
    let usage: AgentUsage | undefined;
    const startedAt = now().getTime();
    const deadline = AbortSignal.timeout(c.get("turnDeadlineMs"));
    let reply: ReadableStream<UIMessageChunk>;
    try {
      reply = await c.get("runAgent")(
        buildChatParams(agentHistory, person, services, {
          previousConfidence,
          waitingDraft,
          recordUsage: (turn) => {
            usage = turn;
          },
          abortSignal: deadline,
        }),
      );
    } catch (error) {
      // The message stays saved; the UI's retry sends it again without counting it twice.
      logError("The agent could not start:", error);
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

    // The decision record goes with the reply, before "finish", so the reply on screen can be
    // explained without a reload (stage 8 PRD, S-08.4). It is built once; onEnd saves the same
    // object, so the live and the stored record cannot differ.
    let decision: DecisionRecord | undefined;
    let finishedAt = now();
    const stream = createUIMessageStream({
      originalMessages: agentHistory as unknown as UIMessage[],
      generateId: randomUUID,
      execute: async ({ writer }) => {
        const [toClient, toAssemble] = watched.tee();
        const assembled = lastMessage(toAssemble);
        let finish: UIMessageChunk | undefined;
        const reader = toClient.getReader();
        // Past the deadline the turn ends here, even if the agent did not stop: nothing is
        // saved and the chat offers "Tentar de novo" (Stage 5).
        let timedOut = false;
        const stop = () => {
          timedOut = true;
          void reader.cancel();
        };
        deadline.addEventListener("abort", stop, { once: true });
        for (let read = await reader.read(); !read.done; read = await reader.read()) {
          if (read.value.type === "finish") finish = read.value;
          else writer.write(read.value);
        }
        deadline.removeEventListener("abort", stop);
        if (timedOut) {
          failed = true;
          writer.write({ type: "error", errorText: "The reply took too long." });
          return;
        }
        const parts = (await assembled)?.parts;
        if (!failed && parts) {
          finishedAt = now();
          // Built from what actually ran (stage 6 PRD, S-06.14).
          decision = buildDecisionRecord(parts);
          writer.write({
            type: "message-metadata",
            messageMetadata: { author: "agent", createdAt: finishedAt.toISOString(), decision },
          });
        }
        if (finish) writer.write(finish);
      },
      onEnd: async ({ responseMessage, isAborted }) => {
        if (!ended || failed || isAborted) return;
        try {
          await appendMessage(
            db,
            person.id,
            {
              id: responseMessage.id,
              author: "agent",
              parts: responseMessage.parts,
              decision: decision ?? buildDecisionRecord(responseMessage.parts),
              ...(usage ? { usage: replyUsage(usage, finishedAt.getTime() - startedAt) } : {}),
            },
            finishedAt,
          );
        } catch (error) {
          logError("Could not save the agent's reply:", error);
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
