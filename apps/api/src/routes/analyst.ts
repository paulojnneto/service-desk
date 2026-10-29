import { Hono } from "hono";
import { z } from "zod";
import { requireRole, type AppEnv } from "../auth";
import { findConversationById, listDecisions, listMessages } from "../conversations/repository";
import { toConversationView } from "../conversations/to-ui";
import { findWaitingDraft, listDrafts } from "../drafts/repository";

const ConversationId = z.uuid();

// What the analyst reads (stage 8 PRD, S-08.12): any conversation, in the same shape as the
// employee's route, with every reply's decision record. Read only; the console that lists
// conversations and takes them over is Stage 9.
export const analystRoutes = new Hono<AppEnv>()
  .use(requireRole("analyst"))
  .get("/conversations/:id", async (c) => {
    const id = c.req.param("id");
    if (!ConversationId.safeParse(id).success) return c.json({ error: "invalid_id" }, 400);
    const db = c.get("db");
    try {
      const conversation = await findConversationById(db, id);
      if (!conversation) return c.json({ error: "not_found" }, 404);
      const [rows, decisions, draft, drafts] = await Promise.all([
        listMessages(db, id),
        listDecisions(db, id),
        findWaitingDraft(db, id),
        listDrafts(db, id),
      ]);
      return c.json({
        conversation: toConversationView(conversation, rows, decisions, draft?.id ?? null, drafts),
      });
    } catch (error) {
      console.error("Could not load the conversation for the analyst:", error);
      return c.json({ error: "unavailable" }, 503);
    }
  });
