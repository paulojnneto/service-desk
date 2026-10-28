import { Hono, type Context } from "hono";
import { z } from "zod";
import { requireRole, type AppEnv } from "../auth";
import { cancelDraft, confirmDraft, type DraftOutcome } from "../drafts/confirm";

// "Confirmar" and "Cancelar" on a draft (stage 6 PRD, S-06.5 and S-06.6). Confirming is an
// explicit action of the employee, never something the model can do.
const DraftId = z.uuid();

export const draftRoutes = new Hono<AppEnv>()
  .use(requireRole("employee"))
  .post("/:id/confirm", (c) =>
    run(c, (deps, id) => confirmDraft({ ...deps, tickets: c.get("tickets") }, id)),
  )
  .post("/:id/cancel", (c) => run(c, cancelDraft));

type Deps = Parameters<typeof cancelDraft>[0];

async function run(c: Context<AppEnv>, action: (deps: Deps, id: string) => Promise<DraftOutcome>) {
  const id = DraftId.safeParse(c.req.param("id"));
  // An id that is not even a UUID is as unknown as another person's draft.
  if (!id.success) return c.json({ error: "not_found" }, 404);

  let outcome: DraftOutcome;
  try {
    outcome = await action(
      { db: c.get("db"), person: c.get("person")!, now: c.get("now") },
      id.data,
    );
  } catch (error) {
    console.error("Could not decide on the draft:", error);
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
