import {
  dueAt,
  priorityFor,
  type DraftView,
  type EditDraftInput,
  type Person,
  type StoredMessage,
} from "@nexo/shared";
import type { TicketsClient } from "@nexo/tickets-client";
import { appendMessage } from "../conversations/repository";
import { toStoredMessage } from "../conversations/to-ui";
import type { Db } from "../db/connect";
import { ownWaitingDraft, type DraftOutcome } from "./confirm";
import { findDraft, toDraftView, updatePendingDraft, type DraftRow } from "./repository";

// "Editar" on a draft (stage 7 PRD, S-07.6). The employee changes the fields they see; the
// server recalculates priority and deadline with the Stage 6 rule and keeps the same draft.
// Nothing is written to the ticket service: that still happens only on "Confirmar".

export type EditOutcome =
  | { status: "done"; draft: DraftView; message: StoredMessage | null }
  | { status: "invalid" }
  | Exclude<DraftOutcome, { status: "done" | "refused" }>;

type Deps = { db: Db; tickets: TicketsClient; person: Person; now: () => Date };

export async function editDraft(
  deps: Deps,
  draftId: string,
  input: EditDraftInput,
): Promise<EditOutcome> {
  const { db, person, now } = deps;
  const found = await ownWaitingDraft(db, person.id, draftId);
  if (found.status !== "waiting") return notEditable(found);
  const row = found.row;
  if (row.kind !== input.kind) return { status: "invalid" };

  let changes: Pick<DraftRow, "fields" | "duplicates">;
  try {
    changes = await changesFor(deps, row, input);
  } catch (error) {
    if ((error as { kind?: string }).kind === "unavailable") return { status: "unavailable" };
    throw error;
  }

  const updated = await updatePendingDraft(db, person.id, draftId, changes);
  if (!updated) return stateOf(await findDraft(db, person.id, draftId));

  // A note for the employee; the agent sees the new fields through its instructions.
  const note = `Você editou o rascunho D-${updated.number}.`;
  const saved = await appendMessage(
    db,
    person.id,
    { author: "system", parts: [{ type: "text", text: note }] },
    now(),
  );
  return {
    status: "done",
    draft: toDraftView(updated),
    message: saved ? toStoredMessage(saved) : null,
  };
}

async function changesFor(
  deps: Deps,
  row: DraftRow,
  input: EditDraftInput,
): Promise<Pick<DraftRow, "fields" | "duplicates">> {
  if (input.kind !== "create") return { fields: input.fields, duplicates: row.duplicates };

  const previous = row.fields as { category: string };
  const priority = priorityFor(input.fields.impact, input.fields.urgency);
  const fields = {
    ...input.fields,
    priority,
    dueAt: dueAt(priority, deps.now()).toISOString(),
  };
  // The open tickets of the category are listed again only when the category changed (R4).
  if (input.fields.category === previous.category) return { fields, duplicates: row.duplicates };
  const open = await deps.tickets.as(deps.person.id).list("open");
  const duplicates = open
    .filter((t) => t.category === input.fields.category)
    .map((t) => ({ number: t.number, title: t.title, status: t.status }));
  return { fields, duplicates };
}

// A draft that is no longer pending cannot be edited, whatever happened to it.
function notEditable(outcome: DraftOutcome): EditOutcome {
  if (outcome.status === "not_found" || outcome.status === "in_progress") {
    return { status: outcome.status };
  }
  return { status: "closed" };
}

function stateOf(row: DraftRow | null): EditOutcome {
  if (!row) return { status: "not_found" };
  return row.status === "confirming" ? { status: "in_progress" } : { status: "closed" };
}
