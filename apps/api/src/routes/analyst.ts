import {
  AnalystMessageInput,
  ConsoleFilter,
  consoleEmployee,
  holderFor,
  type AnalystConversationView,
  type ConsoleTickets,
  type ConversationSummary,
} from "@nexo/shared";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { requireRole, type AppEnv } from "../auth";
import { consoleList, summarize } from "../conversations/console";
import {
  appendAnalystMessage,
  closeByAnalyst,
  conversationsMentioning,
  findConversationById,
  handBack,
  lastAgentConfidences,
  lastMessages,
  latestHandoffs,
  listConsoleConversations,
  listDecisions,
  listHandoffs,
  listMessages,
  messagesAfter,
  takeOver,
  type ConsoleActionResult,
  type ConversationRow,
} from "../conversations/repository";
import { toConversationView, toHandoffView, toStoredMessage } from "../conversations/to-ui";
import type { Db } from "../db/connect";
import { findWaitingDraft, listDrafts } from "../drafts/repository";
import { logError } from "../log";

const ConversationId = z.uuid();
// The cursor of the updates: the highest message seq the screen already has.
export const After = z.coerce.number().int().min(0).catch(0);
const TICKET_NUMBER = /^(INC|REQ)-\d+$/i;

// The analyst console's API (stage 9 tech spec). Every route needs the analyst role; any
// analyst reads any conversation (stage 8 PRD, S-08.12), and the actions follow decision 3:
// any analyst takes over, only the holder replies, and the holder (or anyone while it waits)
// hands back or closes.
export const analystRoutes = new Hono<AppEnv>()
  .use(requireRole("analyst"))
  // The list (S-09.3, S-09.4): every filter's count, the chosen filter's rows.
  .get("/conversations", async (c) => {
    const filter = ConsoleFilter.catch("para_voce").parse(c.req.query("filter"));
    const query = (c.req.query("q") ?? "").trim().slice(0, 100);
    const db = c.get("db");
    try {
      const rows = await listConsoleConversations(db, c.get("now")());
      const ids = rows.map((row) => row.id);
      const [last, confidences, handoffs, ticketHits] = await Promise.all([
        lastMessages(db, ids),
        lastAgentConfidences(db, ids),
        latestHandoffs(db, ids),
        TICKET_NUMBER.test(query)
          ? conversationsMentioning(db, ids, query.toUpperCase())
          : Promise.resolve(new Set<string>()),
      ]);
      const summaries = rows.flatMap((row) => {
        const handoff = handoffs.get(row.id);
        const summary = summarize({
          conversation: row,
          lastMessage: last.get(row.id) ?? null,
          lastConfidence: confidences.get(row.id) ?? null,
          handoff: handoff ? toHandoffView(handoff) : null,
        });
        return summary ? [summary] : ([] as ConversationSummary[]);
      });
      return c.json(
        consoleList(summaries, { filter, query, analystId: c.get("person")!.id, ticketHits }),
      );
    } catch (error) {
      logError("Could not list the conversations:", error);
      return c.json({ error: "unavailable" }, 503);
    }
  })
  .get("/conversations/:id", (c) =>
    withConversation(c, async (db, row) => c.json({ conversation: await analystView(db, row) })),
  )
  // What changed since the screen's last message (decision 1): every author, the state, the
  // holder and the handoffs.
  .get("/conversations/:id/updates", (c) =>
    withConversation(c, async (db, row) => {
      const [rows, handoffs] = await Promise.all([
        messagesAfter(db, row.id, After.parse(c.req.query("after"))),
        listHandoffs(db, row.id),
      ]);
      return c.json({
        conversationId: row.id,
        state: row.state,
        holder: holderFor(row.holderId),
        messages: rows.map((message) => toStoredMessage(message)),
        handoffs: handoffs.map(toHandoffView),
      });
    }),
  )
  // The employee's tickets (S-09.6), read as that employee: the ticket service keeps its R7
  // checks, and only the conversation's employee can be read (decision 7).
  .get("/conversations/:id/tickets", (c) =>
    withConversation(c, async (db, row) => {
      const related = await relatedTicket(db, row.id);
      try {
        const tickets = await c.get("tickets").as(row.employeeId).list("all");
        const answer: ConsoleTickets = {
          related: tickets.find((t) => t.number === related) ?? null,
          others: tickets.filter((t) => t.number !== related),
        };
        return c.json(answer);
      } catch (error) {
        logError("Could not read the employee's tickets:", error);
        return c.json({ error: "unavailable" }, 503);
      }
    }),
  )
  .post("/conversations/:id/take-over", (c) =>
    withConversation(c, async (db, row, me) => {
      const result = await takeOver(db, row.id, me, c.get("now")());
      if (result.status === "done") await takeOverTicket(c, db, row);
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
    logError("Could not answer the analyst console:", error);
    return c.json({ error: "unavailable" }, 503);
  }
}

// The ticket of the latest handoff that named one.
async function relatedTicket(db: Db, conversationId: string) {
  return (await listHandoffs(db, conversationId)).findLast((h) => h.ticketNumber)?.ticketNumber;
}

// The handoff's ticket moves to "em andamento" in the ticket service, as the employee: the
// service keeps its R7 checks. As with the handoff's transfer event, the conversation is
// already the analyst's: if the ticket service is down, that is only logged.
async function takeOverTicket(c: C, db: Db, row: ConversationRow) {
  const related = await relatedTicket(db, row.id);
  if (!related) return;
  const analyst = c.get("person")!;
  try {
    await c
      .get("tickets")
      .as(row.employeeId)
      .takeOver(related, { analystId: analyst.id, analystName: analyst.name });
  } catch (error) {
    logError("Could not record the take-over on the ticket:", error);
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
