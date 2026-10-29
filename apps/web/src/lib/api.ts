import type {
  AnalystConversationView,
  ConsoleFilter,
  ConsoleList,
  ConsoleTickets,
  ConversationUpdates,
  HandoffView,
  LastClosed,
  Holder,
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

// The employee's open conversation, or null before the first message (stage 5 PRD, S-05.5),
// with the last conversation when an analyst closed it.
export async function fetchCurrentChat(): Promise<{
  conversation: ConversationView | null;
  lastClosed: LastClosed | null;
}> {
  const res = await request("/api/conversations/current");
  if (res.status === 401) throw new SignedOutError();
  if (!res.ok) throw new ApiUnavailableError();
  const body = (await res.json()) as {
    conversation: ConversationView | null;
    lastClosed?: LastClosed | null;
  };
  return { conversation: body.conversation, lastClosed: body.lastClosed ?? null };
}

export async function fetchCurrentConversation(): Promise<ConversationView | null> {
  return (await fetchCurrentChat()).conversation;
}

// What changed in the employee's latest conversation after a message (stage 9 PRD, decision
// 1); null before the first conversation.
export async function fetchConversationUpdates(after: number): Promise<ConversationUpdates | null> {
  const res = await request(`/api/conversations/current/updates?after=${after}`);
  if (res.status === 401) throw new SignedOutError();
  if (!res.ok) throw new ApiUnavailableError();
  const body = (await res.json()) as ConversationUpdates | { conversation: null };
  return "state" in body ? body : null;
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

// --- Analyst console (stage 9) ---------------------------------------------------------------

async function readJson<T>(res: Response): Promise<T> {
  if (res.status === 401) throw new SignedOutError();
  if (!res.ok) throw new ApiUnavailableError();
  return (await res.json()) as T;
}

export async function fetchConsoleList(filter: ConsoleFilter, query: string): Promise<ConsoleList> {
  const params = new URLSearchParams({ filter, q: query });
  return readJson(await request(`/api/analyst/conversations?${params}`));
}

// null when the conversation does not exist.
export async function fetchAnalystConversation(
  id: string,
): Promise<AnalystConversationView | null> {
  const res = await request(`/api/analyst/conversations/${encodeURIComponent(id)}`);
  if (res.status === 404 || res.status === 400) return null;
  return (await readJson<{ conversation: AnalystConversationView }>(res)).conversation;
}

export type AnalystUpdates = ConversationUpdates & { handoffs: HandoffView[] };

export async function fetchAnalystUpdates(id: string, after: number): Promise<AnalystUpdates> {
  return readJson(
    await request(`/api/analyst/conversations/${encodeURIComponent(id)}/updates?after=${after}`),
  );
}

export async function fetchConsoleTickets(id: string): Promise<ConsoleTickets> {
  return readJson(await request(`/api/analyst/conversations/${encodeURIComponent(id)}/tickets`));
}

export type ConsoleAction = "take-over" | "hand-back" | "close";

export type ConsoleActionResult =
  | { ok: true; conversation: AnalystConversationView }
  | { ok: false; error: string; holder?: Holder | null };

// Take over, hand back or close (stage 9 PRD, S-09.7 and S-09.9). A refusal says why, and who
// holds the conversation when that is the reason.
export async function runConsoleAction(
  id: string,
  action: ConsoleAction,
): Promise<ConsoleActionResult> {
  return consoleAnswer(
    await sendJson(`/api/analyst/conversations/${encodeURIComponent(id)}/${action}`, {}),
  );
}

export type AnalystReplyResult =
  { ok: true; message: StoredMessage } | { ok: false; error: string; holder?: Holder | null };

export async function sendAnalystMessage(
  id: string,
  reply: { clientId: string; text: string },
): Promise<AnalystReplyResult> {
  const res = await sendJson(
    `/api/analyst/conversations/${encodeURIComponent(id)}/messages`,
    reply,
  );
  if (!res) return { ok: false, error: "unavailable" };
  if (res.status === 401) throw new SignedOutError();
  const body = (await res.json().catch(() => ({}))) as {
    message?: StoredMessage;
    error?: string;
    holder?: Holder | null;
  };
  if (res.ok && body.message) return { ok: true, message: body.message };
  return { ok: false, error: body.error ?? "unavailable", holder: body.holder };
}

async function consoleAnswer(res: Response | null): Promise<ConsoleActionResult> {
  if (!res) return { ok: false, error: "unavailable" };
  if (res.status === 401) throw new SignedOutError();
  const body = (await res.json().catch(() => ({}))) as {
    conversation?: AnalystConversationView;
    error?: string;
    holder?: Holder | null;
  };
  if (res.ok && body.conversation) return { ok: true, conversation: body.conversation };
  return { ok: false, error: body.error ?? "unavailable", holder: body.holder };
}

// A POST that answers null instead of throwing when the API cannot be reached.
async function sendJson(path: string, body: unknown): Promise<Response | null> {
  try {
    return await postJson(path, body);
  } catch {
    return null;
  }
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
