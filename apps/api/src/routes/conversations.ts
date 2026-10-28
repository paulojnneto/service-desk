import { Hono } from "hono";
import { requireRole, type AppEnv } from "../auth";
import {
  closeOpenConversation,
  findOpenConversation,
  listMessages,
} from "../conversations/repository";
import { toConversationView } from "../conversations/to-ui";

// The employee's open conversation. No route takes a conversation id: it is always the
// open one of the session's person, so another person's conversation cannot be named
// (stage 5 PRD, S-05.13).
export const conversationRoutes = new Hono<AppEnv>()
  .use(requireRole("employee"))
  // Resuming the chat (S-05.5): the full history in order, or null for an empty chat.
  .get("/current", async (c) => {
    const db = c.get("db");
    try {
      const open = await findOpenConversation(db, c.get("person")!.id);
      if (!open) return c.json({ conversation: null });
      return c.json({ conversation: toConversationView(open, await listMessages(db, open.id)) });
    } catch (error) {
      console.error("Could not load the conversation:", error);
      return c.json({ error: "unavailable" }, 503);
    }
  })
  // "Nova conversa" (S-05.11): closes the open conversation; harmless when there is none.
  .post("/current/close", async (c) => {
    try {
      await closeOpenConversation(c.get("db"), c.get("person")!.id, c.get("now")());
      return c.body(null, 204);
    } catch (error) {
      console.error("Could not close the conversation:", error);
      return c.json({ error: "unavailable" }, 503);
    }
  });
