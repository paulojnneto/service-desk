import { z } from "zod";
import { Impact, Urgency } from "./priority";
import { Category, Priority, TicketType } from "./service-desk";
import { TicketStatus } from "./tickets";

// Drafts: every creation, update and reopening starts as one and only becomes a write
// when the employee confirms it (stage 6 PRD, S-06.4 and S-06.5).

export const DraftKind = z.enum(["create", "update", "reopen"]);
export type DraftKind = z.infer<typeof DraftKind>;

export const DraftStatus = z.enum([
  "pending",
  "confirming",
  "confirmed",
  "cancelled",
  "superseded",
]);
export type DraftStatus = z.infer<typeof DraftStatus>;

export const CreateDraftFields = z.object({
  type: TicketType,
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(2000),
  category: Category,
  impact: Impact,
  urgency: Urgency,
  priority: Priority,
  dueAt: z.string(),
});
export type CreateDraftFields = z.infer<typeof CreateDraftFields>;

export const UpdateDraftFields = z.object({ message: z.string().trim().min(1).max(2000) });
export const ReopenDraftFields = z.object({ reason: z.string().trim().min(1).max(2000) });

export const DraftDuplicate = z.object({
  number: z.string(),
  title: z.string(),
  status: TicketStatus,
});
export type DraftDuplicate = z.infer<typeof DraftDuplicate>;

const draftBase = {
  id: z.string(),
  number: z.string(), // "D-381"
  status: DraftStatus,
  duplicates: z.array(DraftDuplicate),
  // The ticket written when the draft was confirmed.
  resultTicket: z.string().nullable(),
  createdAt: z.string(),
};

export const DraftView = z.discriminatedUnion("kind", [
  z.object({
    ...draftBase,
    kind: z.literal("create"),
    ticketNumber: z.null(),
    fields: CreateDraftFields,
  }),
  z.object({
    ...draftBase,
    kind: z.literal("update"),
    ticketNumber: z.string(),
    fields: UpdateDraftFields,
  }),
  z.object({
    ...draftBase,
    kind: z.literal("reopen"),
    ticketNumber: z.string(),
    fields: ReopenDraftFields,
  }),
]);
export type DraftView = z.infer<typeof DraftView>;

// What the employee can change with "Editar" (stage 7 PRD, decision 5). Priority and
// deadline are not here: the server recalculates them from impact and urgency (R9).
export const EditDraftInput = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("create"),
    fields: CreateDraftFields.pick({
      type: true,
      title: true,
      description: true,
      category: true,
      impact: true,
      urgency: true,
    }),
  }),
  z.object({ kind: z.literal("update"), fields: UpdateDraftFields }),
  z.object({ kind: z.literal("reopen"), fields: ReopenDraftFields }),
]);
export type EditDraftInput = z.infer<typeof EditDraftInput>;
