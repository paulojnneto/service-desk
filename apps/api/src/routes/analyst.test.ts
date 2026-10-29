import type { ConversationView } from "@nexo/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { findOpenConversation } from "../conversations/repository";
import type { Db } from "../db/connect";
import { createTestApp, postJson, signIn } from "../test-app";

// The tests run without NEXO_AGENT_MODEL, so the agent uses the simulated model.
let app: Awaited<ReturnType<typeof createTestApp>>["app"];
let db: Db;

beforeEach(async () => {
  ({ app, db } = await createTestApp());
});

async function get(path: string, cookie?: string) {
  const res = await app.request(path, { headers: cookie ? { cookie } : {} });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

// Ana asks one question and waits for the reply to be stored.
async function anaConversation() {
  const { cookie } = await signIn(app, "ana.souza@nexo.com.br");
  const res = await postJson(
    app,
    "/api/chat",
    {
      message: {
        id: crypto.randomUUID(),
        parts: [{ type: "text", text: "Qual o horário do service desk?" }],
      },
    },
    cookie,
  );
  await res.text();
  for (let i = 0; i < 50; i++) {
    const current = await get("/api/conversations/current", cookie);
    const conversation = current.body.conversation as ConversationView;
    if (conversation.messages.length >= 2) return { cookie, employee: conversation };
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Ana's reply was not stored");
}

describe("GET /api/analyst/conversations/:id", () => {
  it("returns any conversation to an analyst, with the same records the employee sees", async () => {
    const { employee } = await anaConversation();
    const rafael = await signIn(app, "rafael.lima@nexo.com.br");

    const { status, body } = await get(`/api/analyst/conversations/${employee.id}`, rafael.cookie);

    expect(status).toBe(200);
    expect(body.conversation).toEqual(employee);
    const reply = (body.conversation as ConversationView).messages.at(-1);
    expect(reply?.metadata.decision).toMatchObject({
      action: "respondeu_central",
      source: "agent",
    });
  });

  it("refuses employees, even for their own conversation", async () => {
    const { cookie } = await anaConversation();
    const open = await findOpenConversation(db, "ana.souza");

    expect((await get(`/api/analyst/conversations/${open!.id}`, cookie)).status).toBe(403);
    expect((await get(`/api/analyst/conversations/${open!.id}`)).status).toBe(401);
  });

  it("answers 400 to a malformed id and 404 to an unknown one", async () => {
    const rafael = await signIn(app, "rafael.lima@nexo.com.br");

    expect(await get("/api/analyst/conversations/abc", rafael.cookie)).toEqual({
      status: 400,
      body: { error: "invalid_id" },
    });
    expect(await get(`/api/analyst/conversations/${crypto.randomUUID()}`, rafael.cookie)).toEqual({
      status: 404,
      body: { error: "not_found" },
    });
  });
});
