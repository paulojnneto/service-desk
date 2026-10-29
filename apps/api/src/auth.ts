import { findPersonById, initials, type Person, type Role, type SessionUser } from "@nexo/shared";
import { createMiddleware } from "hono/factory";
import type { Db } from "./db/connect";
import type { TicketsClient } from "@nexo/tickets-client";
import type { RunAgent } from "./routes/chat";
import type { Limits } from "./limits";
import { readSession } from "./session";

export type AppEnv = {
  Variables: {
    db: Db;
    tickets: TicketsClient;
    now: () => Date;
    runAgent: RunAgent;
    limits: Limits;
    person: Person | null;
  };
};

// Turns the session cookie into a person. Identity never comes from the request body.
export const session = createMiddleware<AppEnv>(async (c, next) => {
  let data;
  try {
    data = await readSession(c);
  } catch (error) {
    // A database blip must not look like being signed out.
    console.error("Could not read the session:", error);
    return c.json({ error: "unavailable" }, 503);
  }
  const person = data ? findPersonById(data.userId) : undefined;
  // A cookie for someone no longer in the directory, or with a stale role, counts as no session.
  c.set("person", person && person.role === data?.role ? person : null);
  await next();
});

export function requireRole(role: Role) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const person = c.get("person");
    if (!person) return c.json({ error: "unauthenticated" }, 401);
    if (person.role !== role) return c.json({ error: "forbidden" }, 403);
    await next();
  });
}

export function toSessionUser(person: Person): SessionUser {
  return {
    id: person.id,
    role: person.role,
    name: person.name,
    firstName: person.name.split(" ")[0] ?? person.name,
    email: person.email,
    initials: initials(person.name),
  };
}
