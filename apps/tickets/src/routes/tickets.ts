import {
  AddUpdateInput,
  CreateTicketInput,
  ReleaseInput,
  ReopenInput,
  TakeOverInput,
  TransferInput,
  type Ticket,
} from "@nexo/shared";
import type { Context } from "hono";
import { Hono } from "hono";
import type { z } from "zod";
import type { TicketsEnv } from "../env-types";
import { ticketsRepository, type WriteError } from "../repository";

const WRITE_ERROR_STATUS = {
  not_found: 404,
  ticket_closed: 409,
  not_resolved: 409,
  reopen_window_expired: 409,
} as const;

export const ticketRoutes = new Hono<TicketsEnv>()
  .get("/", async (c) => {
    const scope = c.req.query("scope") === "open" ? "open" : "all";
    const tickets = await repo(c).list(c.get("requesterId"), scope, c.get("now")());
    return c.json({ tickets });
  })
  .get("/:number", async (c) => {
    const ticket = await repo(c).get(c.get("requesterId"), c.req.param("number"), c.get("now")());
    return ticket ? c.json({ ticket }) : c.json({ error: "not_found" }, 404);
  })
  .post("/", async (c) => {
    const input = await parseBody(c, CreateTicketInput);
    if (!input) return c.json({ error: "invalid_input" }, 400);
    const ticket = await repo(c).create(c.get("requesterId"), input, c.get("now")());
    return c.json({ ticket }, 201);
  })
  .post("/:number/updates", async (c) => {
    const input = await parseBody(c, AddUpdateInput);
    if (!input) return c.json({ error: "invalid_input" }, 400);
    const result = await repo(c).addUpdate(
      c.get("requesterId"),
      c.req.param("number"),
      input.message,
      c.get("now")(),
    );
    return respond(c, result, 201);
  })
  .post("/:number/reopen", async (c) => {
    const input = await parseBody(c, ReopenInput);
    if (!input) return c.json({ error: "invalid_input" }, 400);
    const result = await repo(c).reopen(
      c.get("requesterId"),
      c.req.param("number"),
      input.reason,
      c.get("now")(),
    );
    return respond(c, result, 200);
  })
  .post("/:number/transfers", async (c) => {
    const input = await parseBody(c, TransferInput);
    if (!input) return c.json({ error: "invalid_input" }, 400);
    const result = await repo(c).transfer(
      c.get("requesterId"),
      c.req.param("number"),
      input.summary,
      c.get("now")(),
    );
    return respond(c, result, 201);
  })
  .post("/:number/take-over", async (c) => {
    const input = await parseBody(c, TakeOverInput);
    if (!input) return c.json({ error: "invalid_input" }, 400);
    const result = await repo(c).takeOver(
      c.get("requesterId"),
      c.req.param("number"),
      input,
      c.get("now")(),
    );
    return respond(c, result, 200);
  })
  .post("/:number/release", async (c) => {
    const input = await parseBody(c, ReleaseInput);
    if (!input) return c.json({ error: "invalid_input" }, 400);
    const result = await repo(c).release(
      c.get("requesterId"),
      c.req.param("number"),
      input,
      c.get("now")(),
    );
    return respond(c, result, 200);
  });

function repo(c: Context<TicketsEnv>) {
  return ticketsRepository(c.get("db"));
}

function respond(c: Context<TicketsEnv>, result: Ticket | WriteError, status: 200 | 201) {
  if (typeof result === "string") return c.json({ error: result }, WRITE_ERROR_STATUS[result]);
  return c.json({ ticket: result }, status);
}

// The issue path goes to the log, not to the response.
async function parseBody<T extends z.ZodType>(c: Context<TicketsEnv>, schema: T) {
  const parsed = schema.safeParse(await c.req.json().catch(() => null));
  if (parsed.success) return parsed.data as z.infer<T>;
  console.warn(
    `Invalid input on ${c.req.method} ${c.req.path}:`,
    parsed.error.issues.map((issue) => issue.path.join(".") || "(body)").join(", "),
  );
  return null;
}
