import type { ConversationView } from "@nexo/shared";
import type { UIMessageChunk } from "ai";
import { beforeEach, describe, expect, it } from "vitest";
import { setConversationState } from "../conversations/repository";
import type { Db } from "../db/connect";
import { createTestApp, postJson, signIn } from "../test-app";
import type { RunAgent } from "./chat";

let app: Awaited<ReturnType<typeof createTestApp>>["app"];
let db: Db;

// A short, fixed reply keeps these tests about storage, not about the agent.
const reply: RunAgent = async () =>
  new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of [
        { type: "start" },
        { type: "text-start", id: "t" },
        { type: "text-delta", id: "t", delta: "Certo." },
        { type: "text-end", id: "t" },
        { type: "finish" },
      ] as UIMessageChunk[]) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

beforeEach(async () => {
  ({ app, db } = await createTestApp({ runAgent: reply }));
});

type App = typeof app;

async function current(cookie: string, target: App = app) {
  const res = await target.request("/api/conversations/current", { headers: { cookie } });
  return { res, body: (await res.json()) as { conversation: ConversationView | null } };
}

async function say(cookie: string, id: string, text: string) {
  const res = await postJson(
    app,
    "/api/chat",
    { message: { id, parts: [{ type: "text", text }] } },
    cookie,
  );
  await res.text();
  // The reply is saved as the stream closes.
  for (let i = 0; i < 50; i++) {
    const { body } = await current(cookie);
    if (body.conversation?.messages.at(-1)?.metadata.author === "agent") return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("GET /api/conversations/current", () => {
  it("is null before the first message", async () => {
    const { cookie } = await signIn(app, "ana.souza@nexo.com.br");
    const { res, body } = await current(cookie);

    expect(res.status).toBe(200);
    expect(body).toEqual({ conversation: null });
  });

  it("returns the whole history in order, with authors, state and count", async () => {
    const { cookie } = await signIn(app, "ana.souza@nexo.com.br");
    await say(cookie, "m1", "primeira");
    await say(cookie, "m2", "segunda");

    const { body } = await current(cookie);

    expect(body.conversation).toMatchObject({
      state: "with_agent",
      employeeMessages: 2,
      limit: 30,
    });
    expect(body.conversation?.messages.map((m) => [m.role, m.metadata.author, m.parts])).toEqual([
      ["user", "employee", [{ type: "text", text: "primeira" }]],
      ["assistant", "agent", expect.arrayContaining([expect.objectContaining({ text: "Certo." })])],
      ["user", "employee", [{ type: "text", text: "segunda" }]],
      ["assistant", "agent", expect.arrayContaining([expect.objectContaining({ text: "Certo." })])],
    ]);
  });

  it("survives a restart: a new app over the same database returns the same conversation", async () => {
    const { cookie } = await signIn(app, "ana.souza@nexo.com.br", true);
    await say(cookie, "m1", "antes de reiniciar");
    await setConversationState(db, "ana.souza", "with_analyst", new Date());
    const before = (await current(cookie)).body.conversation;

    const restarted = await createTestApp({ db });
    const after = (await current(cookie, restarted.app)).body.conversation;

    expect(after).toEqual(before);
    expect(after?.state).toBe("with_analyst");
  });

  it("never returns another employee's conversation", async () => {
    const ana = await signIn(app, "ana.souza@nexo.com.br");
    const bruno = await signIn(app, "bruno.tavares@nexo.com.br");
    await say(ana.cookie, "m1", "segredo da Ana");

    expect((await current(bruno.cookie)).body).toEqual({ conversation: null });
  });
});

describe("POST /api/conversations/current/close", () => {
  it("closes the conversation; the next message starts a new one at 1/30", async () => {
    const { cookie } = await signIn(app, "ana.souza@nexo.com.br");
    await say(cookie, "m1", "antiga");
    const old = (await current(cookie)).body.conversation;

    const res = await postJson(app, "/api/conversations/current/close", {}, cookie);
    expect(res.status).toBe(204);
    expect((await current(cookie)).body).toEqual({ conversation: null });

    await say(cookie, "m1", "nova");
    const fresh = (await current(cookie)).body.conversation;
    expect(fresh?.id).not.toBe(old?.id);
    expect(fresh?.employeeMessages).toBe(1);
  });

  it("is a no-op without an open conversation", async () => {
    const { cookie } = await signIn(app, "ana.souza@nexo.com.br");
    const res = await postJson(app, "/api/conversations/current/close", {}, cookie);

    expect(res.status).toBe(204);
  });
});

describe("access", () => {
  it("answers 401 without a session and 403 to analysts", async () => {
    const rafael = await signIn(app, "rafael.lima@nexo.com.br");

    expect((await app.request("/api/conversations/current")).status).toBe(401);
    expect((await current(rafael.cookie)).res.status).toBe(403);
    const close = await postJson(app, "/api/conversations/current/close", {}, rafael.cookie);
    expect(close.status).toBe(403);
  });
});
