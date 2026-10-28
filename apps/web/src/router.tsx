import type { SessionUser } from "@nexo/shared";
import { createBrowserRouter, redirect } from "react-router";
import { PageLoading } from "./components/page-loading";
import { RouteError } from "./components/route-error";
import { fetchSessionUser, signOut } from "./lib/api";
import { redirectFor, type Area } from "./lib/guards";
import { AnalystLanding } from "./routes/analyst/landing";
import { EmployeeLayout } from "./routes/employee/layout";
import { ProfilePage } from "./routes/employee/profile";
import { SupportPage } from "./routes/employee/support";
import { signInAction } from "./routes/sign-in/action";
import { SignInPage } from "./routes/sign-in/page";

// Each area asks the API who is signed in before rendering, so a screen never
// shows up for the wrong person, not even for a moment.
function areaLoader(area: Area) {
  return async (): Promise<{ user: SessionUser | null }> => {
    const user = await fetchSessionUser();
    const target = redirectFor(area, user);
    if (target) throw redirect(target);
    return { user };
  };
}

export const router = createBrowserRouter([
  {
    path: "/login",
    loader: areaLoader("public"),
    action: signInAction,
    Component: SignInPage,
    HydrateFallback: PageLoading,
    ErrorBoundary: RouteError,
  },
  {
    id: "employee",
    path: "/",
    loader: areaLoader("employee"),
    Component: EmployeeLayout,
    HydrateFallback: PageLoading,
    ErrorBoundary: RouteError,
    children: [
      { index: true, Component: SupportPage },
      { path: "perfil", Component: ProfilePage },
    ],
  },
  {
    path: "/console",
    loader: areaLoader("analyst"),
    Component: AnalystLanding,
    HydrateFallback: PageLoading,
    ErrorBoundary: RouteError,
  },
  {
    path: "/sign-out",
    action: async () => {
      // Signing out locally still makes sense if the API is briefly unreachable.
      await signOut().catch(() => undefined);
      return redirect("/login");
    },
  },
  { path: "*", loader: () => redirect("/") },
]);
