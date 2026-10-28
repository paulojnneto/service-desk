import type { Role, SessionUser } from "@nexo/shared";

// Who may open which area, and where everyone else goes.
// The API is what protects the data; these rules only keep each screen with its audience.
export type Area = "public" | Role;

export function homePath(role: Role): string {
  return role === "analyst" ? "/console" : "/";
}

export function redirectFor(area: Area, user: SessionUser | null): string | null {
  if (area === "public") return user ? homePath(user.role) : null;
  if (!user) return "/login";
  return user.role === area ? null : homePath(user.role);
}
