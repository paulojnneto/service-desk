import {
  AnalystMessageInput,
  consoleEmployee,
  holderFor,
  type AnalystConversationView,
} from "@nexo/shared";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { requireRole, type AppEnv } from "../auth";
import {
  appendAnalystMessage,
  closeByAnalyst,
  findConversationById,
  handBack,
  listDecisions,
  listHandoffs,
  listMessages,
  takeOver,
  type ConsoleActionResult,
  type ConversationRow,
} from "../conversations/repository";
import { toConversationView, toHandoffView, toStoredMessage } from "../conversations/to-ui";
import type { Db } from "../db/connect";
import { findWaitingDraft, listDrafts } from "../drafts/repository";

const ConversationId = z.uuid();

// The analyst console's API (stage 9 tech spec). Every route needs the analyst role; any
// analyst reads any conversation (stage 8 PRD, S-08.12), and the actions follow decision 3:
// any analyst takes over, only the holder replies, and the holder (or anyone while it waits)
// hands back or closes.
export const analystRoutes = new Hono<AppEnv>()
  .use(requireRole("analyst"))
  .get("/conversations/:id", (c) =>
    withConversation(c, async (db, row) => c.json({ conversation: await analystView(db, row) })),
  )
  .post("/conversations/:id/take-over", (c) =>
    withConversation(c, async (db, row, me) => {
      const result = await takeOver(db, row.id, me, c.get("now")());
      // Taking over what one already holds is not an error.
      if (result.status === "refused" && result.conversation?.holderId === me) {
        return c.json({ conversation: await analystView(db, result.conversation) });
      }
      return answer(c, db, result, "already_held");
    }),
  )
  .post("/conversations/:id/hand-back", (c) =>
    withConversation(c, async (db, row, me) =>
      answer(c, db, await handBack(db, row.id, me, c.get("now")()), "not_holder"),
    ),
  )
  .post("/conversations/:id/close", (c) =>
    withConversation(c, async (db, row, me) =>
      answer(c, db, await closeByAnalyst(db, row.id, me, c.get("now")()), "not_holder"),
    ),
  )
  .post("/conversations/:id/messages", (c) =>
    withConversation(c, async (db, row, me) => {
      const input = AnalystMessageInput.safeParse(await c.req.json().catch(() => null));
      if (!input.success) return c.json({ error: "invalid_input" }, 400);
      const result = await appendAnalystMessage(db, row.id, me, input.data, c.get("now")());
      if (result.status === "saved") return c.json({ message: toStoredMessage(result.message) });
      return refusal(c, result.conversation, "not_holder");
    }),
  );

type C = Context<AppEnv>;

// Checks the id, finds the conversation and turns failures into 400, 404 and 503.
async function withConversation(
  c: C,
  handler: (db: Db, row: ConversationRow, me: string) => Promise<Response>,
) {
  const id = c.req.param("id");
  if (!ConversationId.safeParse(id).success) return c.json({ error: "invalid_id" }, 400);
  const db = c.get("db");
  try {
    const row = await findConversationById(db, id!);
    if (!row) return c.json({ error: "not_found" }, 404);
    return await handler(db, row, c.get("person")!.id);
  } catch (error) {
    console.error("Could not answer the analyst console:", error);
    return c.json({ error: "unavailable" }, 503);
  }
}

async function answer(c: C, db: Db, result: ConsoleActionResult, lost: string) {
  if (result.status === "done") {
    return c.json({ conversation: await analystView(db, result.conversation) });
  }
  return refusal(c, result.conversation, lost);
}

// 409 with who holds it now, so the console can say "Júlia Castro já assumiu".
function refusal(c: C, row: ConversationRow | null, lost: string) {
  if (!row) return c.json({ error: "not_found" }, 404);
  if (row.state === "closed") return c.json({ error: "closed" }, 409);
  return c.json({ error: lost, holder: holderFor(row.holderId) }, 409);
}

async function analystView(db: Db, row: ConversationRow): Promise<AnalystConversationView> {
  const [rows, decisions, draft, drafts, handoffs] = await Promise.all([
    listMessages(db, row.id),
    listDecisions(db, row.id),
    findWaitingDraft(db, row.id),
    listDrafts(db, row.id),
    listHandoffs(db, row.id),
  ]);
  return {
    ...toConversationView(row, rows, decisions, draft?.id ?? null, drafts),
    employee: consoleEmployee(row.employeeId)!,
    handoffs: handoffs.map(toHandoffView),
  };
}
