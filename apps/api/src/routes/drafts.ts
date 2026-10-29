import { Hono, type Context } from "hono";
import { z } from "zod";
import { requireRole, type AppEnv } from "../auth";
import { EditDraftInput } from "@nexo/shared";
import { cancelDraft, confirmDraft, type DraftOutcome } from "../drafts/confirm";
import { editDraft, type EditOutcome } from "../drafts/edit";
import { logError } from "../log";

// "Confirmar" and "Cancelar" on a draft (stage 6 PRD, S-06.5 and S-06.6). Confirming is an
// explicit action of the employee, never something the model can do.
const DraftId = z.uuid();

export const draftRoutes = new Hono<AppEnv>()
  .use(requireRole("employee"))
  .post("/:id/confirm", (c) =>
    run(c, (deps, id) => confirmDraft({ ...deps, tickets: c.get("tickets") }, id)),
  )
  .post("/:id/cancel", (c) => run(c, cancelDraft))
  // "Editar" (stage 7 PRD, S-07.6): changes the fields of a pending draft, nothing else.
  .patch("/:id", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_input" }, 400);
    }
    const input = EditDraftInput.safeParse(body);
    if (!input.success) return c.json({ error: "invalid_input" }, 400);
    return run(c, (deps, id) => editDraft({ ...deps, tickets: c.get("tickets") }, id, input.data));
  });

type Deps = Parameters<typeof cancelDraft>[0];

async function run(
  c: Context<AppEnv>,
  action: (deps: Deps, id: string) => Promise<DraftOutcome | EditOutcome>,
) {
  const id = DraftId.safeParse(c.req.param("id"));
  // An id that is not even a UUID is as unknown as another person's draft.
  if (!id.success) return c.json({ error: "not_found" }, 404);

  let outcome: DraftOutcome | EditOutcome;
  try {
    outcome = await action(
      { db: c.get("db"), person: c.get("person")!, now: c.get("now") },
      id.data,
    );
  } catch (error) {
    logError("Could not decide on the draft:", error);
    return c.json({ error: "unavailable" }, 503);
  }

  switch (outcome.status) {
    case "done":
      return c.json({ draft: outcome.draft, message: outcome.message });
    case "refused":
      return c.json(
        { error: "ticket_conflict", draft: outcome.draft, message: outcome.message },
        409,
      );
    case "invalid":
      return c.json({ error: "invalid_input" }, 400);
    case "not_found":
      return c.json({ error: "not_found" }, 404);
    case "in_progress":
      return c.json({ error: "draft_in_progress" }, 409);
    case "closed":
      return c.json({ error: "draft_closed" }, 409);
    case "unavailable":
      return c.json({ error: "unavailable" }, 503);
  }
}
