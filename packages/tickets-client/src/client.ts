import { Article, Ticket, type CreateTicketInput } from "@nexo/shared";
import { z } from "zod";
import { errorForStatus, TicketServiceError } from "./errors";
import type { TokenSigner } from "./signer";

// A write can carry the caller's idempotency key instead of a fresh one.
export type WriteOptions = { idempotencyKey?: string };

export type RetryPolicy = {
  delaysMs: number[]; // wait before each retry; attempts = delays + 1
  timeoutMs: number; // per attempt
};

// 5 attempts; the waits add up to 3.75 s, longer than the default 3 s legacy outage.
export const DEFAULT_RETRY: RetryPolicy = { delaysMs: [250, 500, 1000, 2000], timeoutMs: 2000 };

export type TicketsClientOptions = {
  baseUrl: string;
  signToken: TokenSigner;
  fetch?: typeof fetch;
  retry?: RetryPolicy;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

const TicketBody = z.object({ ticket: Ticket });
const TicketsBody = z.object({ tickets: z.array(Ticket) });
const ArticlesBody = z.object({ articles: z.array(Article) });

// Statuses worth retrying: the legacy system is briefly down or a proxy timed out.
const RETRYABLE = new Set([502, 503, 504]);

export function createTicketsClient(options: TicketsClientOptions) {
  const {
    baseUrl,
    signToken,
    fetch: doFetch = globalThis.fetch,
    retry = DEFAULT_RETRY,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    random = Math.random,
  } = options;

  async function request<T>(
    requesterId: string,
    method: "GET" | "POST",
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
    givenKey?: string,
  ): Promise<T> {
    // One key per logical write, reused on every retry, so the service never acts twice.
    // A caller can give its own (a draft's id), so a write repeated later replays too.
    const idempotencyKey = method === "POST" ? (givenKey ?? crypto.randomUUID()) : undefined;

    for (let attempt = 0; ; attempt++) {
      let res: Response | undefined;
      try {
        res = await doFetch(`${baseUrl}${path}`, {
          method,
          headers: {
            authorization: `Bearer ${await signToken(requesterId)}`,
            ...(body !== undefined ? { "content-type": "application/json" } : {}),
            ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(retry.timeoutMs),
        });
      } catch {
        res = undefined; // network error or timeout: treated like an outage
      }

      if (res && !RETRYABLE.has(res.status)) {
        const json: unknown = await res.json().catch(() => null);
        if (res.ok) return schema.parse(json);
        const code = (json as { error?: string } | null)?.error ?? `http_${res.status}`;
        throw errorForStatus(res.status, code);
      }

      const delay = retry.delaysMs[attempt];
      if (delay === undefined)
        throw new TicketServiceError("unavailable", "unavailable", res?.status);
      // Jitter (±20 %) keeps many clients from retrying in lockstep.
      await sleep(delay * (0.8 + random() * 0.4));
    }
  }

  return {
    // Every call is made on behalf of one person, who becomes the token's subject.
    as(requesterId: string) {
      const ticket = (method: "GET" | "POST", path: string, body?: unknown, key?: string) =>
        request(requesterId, method, path, TicketBody, body, key).then((r) => r.ticket);

      return {
        list: (scope: "open" | "all" = "all") =>
          request(requesterId, "GET", `/tickets?scope=${scope}`, TicketsBody).then(
            (r) => r.tickets,
          ),
        get: (number: string) => ticket("GET", `/tickets/${encodeURIComponent(number)}`),
        create: (input: CreateTicketInput, write?: WriteOptions) =>
          ticket("POST", "/tickets", input, write?.idempotencyKey),
        addUpdate: (number: string, message: string, write?: WriteOptions) =>
          ticket(
            "POST",
            `/tickets/${encodeURIComponent(number)}/updates`,
            { message },
            write?.idempotencyKey,
          ),
        reopen: (number: string, reason: string, write?: WriteOptions) =>
          ticket(
            "POST",
            `/tickets/${encodeURIComponent(number)}/reopen`,
            { reason },
            write?.idempotencyKey,
          ),
        transfer: (number: string, summary: string, write?: WriteOptions) =>
          ticket(
            "POST",
            `/tickets/${encodeURIComponent(number)}/transfers`,
            { summary },
            write?.idempotencyKey,
          ),
        searchArticles: (question: string) =>
          request(
            requesterId,
            "GET",
            `/articles/search?q=${encodeURIComponent(question)}`,
            ArticlesBody,
          ).then((r) => r.articles),
      };
    },
  };
}

export type TicketsClient = ReturnType<typeof createTicketsClient>;
