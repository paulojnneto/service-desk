import type { ConversationState, Holder } from "@nexo/shared";

// What the signed-in analyst can do with a conversation (stage 9 PRD, decision 3): any analyst
// takes over one that waits or is still with the agent; only the holder replies; the holder,
// or anyone while it waits, hands back or closes. The API checks the same rules.

export type AllowedActions = {
  takeOver: boolean;
  reply: boolean;
  handBack: boolean;
  close: boolean;
  // Someone else is answering: the console says who and shows no composer.
  heldBy: Holder | null;
};

export function allowedActions(
  state: ConversationState,
  holder: Holder | null,
  analystId: string,
): AllowedActions {
  const mine = state === "with_analyst" && holder?.id === analystId;
  const waiting = state === "waiting_analyst";
  return {
    takeOver: waiting || state === "with_agent",
    reply: mine,
    handBack: mine || waiting,
    close: mine || waiting,
    heldBy: state === "with_analyst" && !mine ? holder : null,
  };
}
