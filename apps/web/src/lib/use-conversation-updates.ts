import { useEffect, useRef } from "react";
import { startPolling } from "./updates";

// Polls every 3 seconds while the tab is visible and `enabled` holds (stage 9 PRD, decision
// 1). The latest `poll` is always the one called, so it can read fresh state.
export const POLL_INTERVAL_MS = 3000;

export function useConversationUpdates(poll: () => Promise<void>, enabled: boolean) {
  const latest = useRef(poll);
  const on = useRef(enabled);
  useEffect(() => {
    latest.current = poll;
    on.current = enabled;
  });

  useEffect(
    () =>
      startPolling({
        poll: () => latest.current(),
        intervalMs: POLL_INTERVAL_MS,
        active: () => on.current && document.visibilityState === "visible",
      }),
    [],
  );
}
