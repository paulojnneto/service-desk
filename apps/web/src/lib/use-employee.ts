import type { SessionUser } from "@nexo/shared";
import { useRouteLoaderData } from "react-router";

// The signed-in employee, for any screen under the "employee" route.
export function useEmployee(): SessionUser {
  const data = useRouteLoaderData("employee") as { user: SessionUser } | undefined;
  if (!data?.user) throw new Error("useEmployee must be used under the employee route");
  return data.user;
}
