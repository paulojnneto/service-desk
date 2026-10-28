import type { SessionUser } from "@nexo/shared";

// Calls to the agent API. Same origin: in development Vite forwards /api to it.

export type SignInError = "invalid_input" | "unknown_email" | "unavailable";

export class ApiUnavailableError extends Error {
  constructor() {
    super("The API is unavailable");
  }
}

// null means "signed out"; any other failure means the API could not answer.
export async function fetchSessionUser(): Promise<SessionUser | null> {
  const res = await request("/api/auth/me");
  if (res.status === 401) return null;
  if (!res.ok) throw new ApiUnavailableError();
  return ((await res.json()) as { user: SessionUser }).user;
}

export async function signIn(input: {
  email: string;
  password: string;
  remember: boolean;
}): Promise<{ user: SessionUser } | { error: SignInError }> {
  let res: Response;
  try {
    res = await postJson("/api/auth/sign-in", input);
  } catch {
    return { error: "unavailable" };
  }
  if (res.ok) return (await res.json()) as { user: SessionUser };
  if (res.status === 400 || res.status === 401) {
    return (await res.json()) as { error: SignInError };
  }
  return { error: "unavailable" };
}

export async function signOut(): Promise<void> {
  await postJson("/api/auth/sign-out", {});
}

function postJson(path: string, body: unknown) {
  return fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function request(path: string) {
  try {
    return await fetch(path);
  } catch {
    throw new ApiUnavailableError();
  }
}
