import { findPersonById, initials, type Person, type Role } from "@nexo/shared";
import { createMiddleware } from "hono/factory";
import { readSession } from "./session";

export type AppEnv = { Variables: { person: Person | null } };

// The narrow view of the signed-in person that the UI receives.
export type SessionUser = {
  id: string;
  role: Role;
  name: string;
  firstName: string;
  email: string;
  initials: string;
};

// Turns the session cookie into a person. Identity never comes from the request body.
export const session = createMiddleware<AppEnv>(async (c, next) => {
  const data = await readSession(c);
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
