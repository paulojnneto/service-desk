import type {
  ConversationView,
  DraftView,
  EditDraftInput,
  SessionUser,
  StoredMessage,
} from "@nexo/shared";

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

export class SignedOutError extends Error {
  constructor() {
    super("The session has ended");
  }
}

// The employee's open conversation, or null before the first message (stage 5 PRD, S-05.5).
export async function fetchCurrentConversation(): Promise<ConversationView | null> {
  const res = await request("/api/conversations/current");
  if (res.status === 401) throw new SignedOutError();
  if (!res.ok) throw new ApiUnavailableError();
  return ((await res.json()) as { conversation: ConversationView | null }).conversation;
}

// "Nova conversa": closes the open conversation.
export async function closeConversation(): Promise<void> {
  const res = await postJson("/api/conversations/current/close", {});
  if (res.status === 401) throw new SignedOutError();
  if (!res.ok) throw new ApiUnavailableError();
}

export type DraftDecision =
  | { ok: true; draft: DraftView; message: StoredMessage | null }
  | { ok: false; error: string; message?: StoredMessage | null };

// "Confirmar" or "Cancelar" on a draft: the server writes the ticket, never the model.
export async function decideDraft(
  id: string,
  action: "confirm" | "cancel",
): Promise<DraftDecision> {
  let res: Response;
  try {
    res = await postJson(`/api/drafts/${encodeURIComponent(id)}/${action}`, {});
  } catch {
    return { ok: false, error: "unavailable" };
  }
  const body = (await res.json().catch(() => ({}))) as {
    draft?: DraftView;
    message?: StoredMessage | null;
    error?: string;
  };
  if (res.ok && body.draft) return { ok: true, draft: body.draft, message: body.message ?? null };
  return { ok: false, error: body.error ?? "unavailable", message: body.message ?? null };
}

// "Editar" on a draft (stage 7 PRD, S-07.6): the server checks the fields and recalculates
// priority and deadline; nothing is written to the ticket service.
export async function editDraft(id: string, input: EditDraftInput): Promise<DraftDecision> {
  let res: Response;
  try {
    res = await fetch(`/api/drafts/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    return { ok: false, error: "unavailable" };
  }
  const body = (await res.json().catch(() => ({}))) as {
    draft?: DraftView;
    message?: StoredMessage | null;
    error?: string;
  };
  if (res.ok && body.draft) return { ok: true, draft: body.draft, message: body.message ?? null };
  return { ok: false, error: body.error ?? "unavailable" };
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
