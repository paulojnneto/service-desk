import type { DraftView } from "@nexo/shared";
import { isToolUIPart, type UIMessage } from "ai";

// The draft a tool part prepared, if any.
export function draftOf(part: UIMessage["parts"][number]): DraftView | null {
  if (!isToolUIPart(part) || part.state !== "output-available") return null;
  const output = part.output as { rascunho?: DraftView } | undefined;
  return output?.rascunho ?? null;
}
