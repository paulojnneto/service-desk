import { Hono } from "hono";
import { requireRole, type AppEnv } from "../auth";
import { holderFor, type ConversationUpdates } from "@nexo/shared";
import {
  closeOpenConversation,
  findLatestConversation,
  findOpenConversation,
  lastClosedByAnalyst,
  listDecisions,
  listMessages,
  messagesAfter,
} from "../conversations/repository";
import { findWaitingDraft, listDrafts } from "../drafts/repository";
import { toConversationView, toStoredMessage } from "../conversations/to-ui";
import { After } from "./analyst";
import { logError } from "../log";

// The employee's open conversation. No route takes a conversation id: it is always the
// open one of the session's person, so another person's conversation cannot be named
// (stage 5 PRD, S-05.13).
export const conversationRoutes = new Hono<AppEnv>()
  .use(requireRole("employee"))
  // Resuming the chat (S-05.5): the full history in order, or null for an empty chat, with
  // the last conversation when an analyst closed it.
  .get("/current", async (c) => {
    const db = c.get("db");
    try {
      const open = await findOpenConversation(db, c.get("person")!.id);
      if (!open) {
        const lastClosed = await lastClosedByAnalyst(db, c.get("person")!.id);
        return c.json({ conversation: null, lastClosed });
      }
      const [rows, decisions, draft, drafts] = await Promise.all([
        listMessages(db, open.id),
        listDecisions(db, open.id),
        findWaitingDraft(db, open.id),
        listDrafts(db, open.id),
      ]);
      return c.json({
        conversation: toConversationView(open, rows, decisions, draft?.id ?? null, drafts),
      });
    } catch (error) {
      logError("Could not load the conversation:", error);
      return c.json({ error: "unavailable" }, 503);
    }
  })
  // What changed since the chat's last message (stage 9 PRD, decision 1): the state, who
  // holds it, and the analysts' and the system's messages. The employee's own messages are
  // already on screen and the agent's arrive by the stream. It reads the latest conversation,
  // so a chat closed by an analyst learns it.
  .get("/current/updates", async (c) => {
    const db = c.get("db");
    try {
      const latest = await findLatestConversation(db, c.get("person")!.id);
      if (!latest) return c.json({ conversation: null });
      const rows = await messagesAfter(db, latest.id, After.parse(c.req.query("after")), [
        "analyst",
        "system",
      ]);
      const updates: ConversationUpdates = {
        conversationId: latest.id,
        state: latest.state as ConversationUpdates["state"],
        holder: holderFor(latest.holderId),
        messages: rows.map((row) => toStoredMessage(row)),
      };
      return c.json(updates);
    } catch (error) {
      logError("Could not read the conversation's updates:", error);
      return c.json({ error: "unavailable" }, 503);
    }
  })
  // "Nova conversa" (S-05.11): closes the open conversation; harmless when there is none.
  .post("/current/close", async (c) => {
    try {
      await closeOpenConversation(c.get("db"), c.get("person")!.id, c.get("now")());
      return c.body(null, 204);
    } catch (error) {
      logError("Could not close the conversation:", error);
      return c.json({ error: "unavailable" }, 503);
    }
  });
