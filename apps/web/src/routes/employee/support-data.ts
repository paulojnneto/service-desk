import type { ConversationView, LastClosed } from "@nexo/shared";
import { redirect } from "react-router";
import { closeConversation, fetchCurrentChat, SignedOutError } from "../../lib/api";

// The open conversation is loaded before the screen renders, so the stored history
// appears at once instead of an empty chat first (stage 5 tech spec).
export async function supportLoader(): Promise<{
  conversation: ConversationView | null;
  lastClosed: LastClosed | null;
}> {
  try {
    return await fetchCurrentChat();
  } catch (error) {
    if (error instanceof SignedOutError) throw redirect("/login");
    throw error;
  }
}

// "Nova conversa": back to "/", where the loader finds no open conversation.
export async function supportAction() {
  try {
    await closeConversation();
  } catch (error) {
    if (error instanceof SignedOutError) throw redirect("/login");
    throw error;
  }
  return redirect("/");
}
