import { z } from "zod";
import { TicketStatus } from "./tickets";

// Questions the agent asks with known answers: quick-reply options or a ticket picker
// (stage 7 PRD, S-07.2 and S-07.3). The employee's answer is an ordinary message.

export const MAX_OPTIONS = 5;
export const MAX_OPTION_LENGTH = 40;
export const MAX_TICKET_CHOICES = 8;

export const TicketChoice = z.object({
  number: z.string(),
  title: z.string(),
  status: TicketStatus,
  openedAt: z.string(),
});
export type TicketChoice = z.infer<typeof TicketChoice>;

export const QuestionView = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("options"),
    question: z.string(),
    options: z.array(z.string().max(MAX_OPTION_LENGTH)).min(2).max(MAX_OPTIONS),
  }),
  z.object({
    kind: z.literal("tickets"),
    question: z.string(),
    tickets: z.array(TicketChoice).min(1).max(MAX_TICKET_CHOICES),
  }),
]);
export type QuestionView = z.infer<typeof QuestionView>;

// What picking a ticket sends as the employee's message (prototype, Screen 3).
export function ticketChoiceText(ticket: Pick<TicketChoice, "number" | "title">): string {
  return `${ticket.number} · ${ticket.title}`;
}
