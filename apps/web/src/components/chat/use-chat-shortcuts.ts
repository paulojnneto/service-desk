import { useEffect, useRef } from "react";

// Keyboard shortcuts of the chat (stage 7 PRD, S-07.9 and decision 6):
// - Ctrl+Enter or ⌘+Enter confirms the draft waiting for confirmation, from anywhere in the
//   chat, as the prototype shows on the button;
// - with the composer empty, the number keys pick the options of the waiting question, so
//   typing a number in a message still works.

export type Shortcuts = {
  waitingDraftId: string | null;
  confirm: (draftId: string) => void;
  choices: string[] | null;
  composerEmpty: boolean;
  pick: (text: string) => void;
  enabled: boolean;
};

export function useChatShortcuts(shortcuts: Shortcuts) {
  // The listener is attached once and reads the latest values.
  const latest = useRef(shortcuts);
  useEffect(() => {
    latest.current = shortcuts;
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const { waitingDraftId, confirm, choices, composerEmpty, pick, enabled } = latest.current;
      if (!enabled || event.defaultPrevented || event.repeat) return;

      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        if (!waitingDraftId || insideEditForm(event.target)) return;
        event.preventDefault();
        confirm(waitingDraftId);
        return;
      }

      const digit = Number(event.key);
      if (!choices || !composerEmpty || !Number.isInteger(digit) || digit < 1) return;
      if (event.ctrlKey || event.metaKey || event.altKey || !typingAllowed(event.target)) return;
      const choice = choices[digit - 1];
      if (!choice) return;
      event.preventDefault();
      pick(choice);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

function insideEditForm(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("form[aria-label^='Editar']") !== null;
}

// Digits pick an option only from the empty composer or outside any other field.
function typingAllowed(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return true;
  if (target.id === "chat-input") return true;
  return !target.closest("input, textarea, select, [contenteditable='true']");
}
