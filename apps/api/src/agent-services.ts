import type { AgentServices } from "@nexo/agent";
import type { TicketsClient } from "@nexo/tickets-client";
import { setConversationState } from "./conversations/repository";
import type { Db } from "./db/connect";
import { discardWaitingDraft, prepareDraft } from "./drafts/repository";

// What the agent can do in one request, for one person and one conversation (stage 6 tech
// spec). Tickets are read only: there is deliberately no create, update or reopen here.
// Those happen in drafts/confirm.ts, when the employee confirms a draft (S-06.5).
export function buildAgentServices(deps: {
  db: Db;
  tickets: TicketsClient;
  employeeId: string;
  conversationId: string;
  now: () => Date;
}): AgentServices {
  const { db, employeeId, conversationId, now } = deps;
  const asEmployee = deps.tickets.as(employeeId);

  return {
    tickets: {
      list: (scope) => asEmployee.list(scope),
      get: (number) => asEmployee.get(number),
      searchArticles: (question) => asEmployee.searchArticles(question),
    },
    drafts: {
      prepare: (input) => prepareDraft(db, { employeeId, conversationId }, input, now()),
      discard: () => discardWaitingDraft(db, conversationId, now()),
    },
    // The only write the model can trigger (stage 6 PRD, S-06.12): the transfer event on the
    // employee's ticket, then the state that keeps the agent quiet.
    handoff: async ({ trigger, summary, ticketNumber }) => {
      if (ticketNumber) {
        try {
          await asEmployee.transfer(ticketNumber, `[${trigger}] ${summary}`);
        } catch (error) {
          // A closed ticket takes no transfer event, but the employee still gets an analyst.
          // Not found (or someone else's) and unavailable go back to the tool.
          if ((error as { kind?: string }).kind !== "conflict") throw error;
        }
      }
      await setConversationState(db, employeeId, "waiting_analyst", now());
    },
    now,
  };
}
