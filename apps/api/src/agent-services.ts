import type { AgentServices } from "@nexo/agent";
import type { TicketsClient } from "@nexo/tickets-client";
import { handOffConversation } from "./conversations/repository";
import type { Db } from "./db/connect";
import { discardWaitingDraft, prepareDraft } from "./drafts/repository";
import { logError } from "./log";

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
    // The only write the model can trigger (stage 6 PRD, S-06.12). The related ticket must
    // be the employee's: not found (or someone else's) goes back to the tool. Then the state,
    // the summary and the note in one transaction (stage 9 PRD, S-09.1), and the transfer
    // event on the ticket last: if the ticket service is down, the employee still gets an
    // analyst, and the handoff keeps the ticket.
    handoff: async ({ trigger, summary, ticketNumber }) => {
      if (ticketNumber) {
        try {
          await asEmployee.get(ticketNumber);
        } catch (error) {
          if ((error as { kind?: string }).kind !== "unavailable") throw error;
        }
      }
      const handedOff = await handOffConversation(
        db,
        conversationId,
        { reason: trigger, summary, ticketNumber: ticketNumber ?? null },
        now(),
      );
      if (handedOff && ticketNumber) {
        try {
          await asEmployee.transfer(ticketNumber, `[${trigger}] ${summary}`);
        } catch (error) {
          // A closed ticket takes no transfer event; anything else is only logged.
          if ((error as { kind?: string }).kind !== "conflict") {
            logError("Could not record the transfer on the ticket:", error);
          }
        }
      }
      return handedOff;
    },
    now,
  };
}
