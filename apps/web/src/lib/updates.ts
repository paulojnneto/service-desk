import type { StoredMessage } from "@nexo/shared";

// Merging what a poll brought into the messages on screen (stage 9 PRD, decision 1). Pure, so
// the order and the absence of duplicates are tested without a DOM.

type WithMetadata = { id: string; metadata?: { seq?: number } };

// The cursor of the next poll: the highest stored seq on screen. Messages still streaming, or
// sent from this tab and not reloaded yet, have none.
export function highestSeq(messages: readonly WithMetadata[]): number {
  return messages.reduce((max, message) => Math.max(max, message.metadata?.seq ?? 0), 0);
}

// Appends the new messages in their stored order, skipping any already on screen.
export function mergeUpdates<M extends WithMetadata>(
  messages: readonly M[],
  incoming: readonly StoredMessage[],
): M[] {
  const seen = new Set(messages.map((message) => message.id));
  const fresh = incoming
    .filter((message) => !seen.has(message.id))
    .sort((a, b) => (a.metadata.seq ?? 0) - (b.metadata.seq ?? 0));
  return fresh.length === 0 ? [...messages] : [...messages, ...(fresh as unknown as M[])];
}

// Runs `poll` every `intervalMs` while `active()` says so (the tab is visible, no reply is
// streaming), never two at once. Returns a function that stops it.
export function startPolling(options: {
  poll: () => Promise<void>;
  intervalMs: number;
  active: () => boolean;
}): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    if (stopped) return;
    if (options.active()) {
      try {
        await options.poll();
      } catch {
        // The next tick tries again from the same cursor.
      }
    }
    if (!stopped) timer = setTimeout(tick, options.intervalMs);
  };
  timer = setTimeout(tick, options.intervalMs);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
