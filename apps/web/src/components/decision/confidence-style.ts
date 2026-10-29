import type { Confidence } from "@nexo/shared";

// Always next to the level's word, never color alone (stage 8 PRD, S-08.3).
export const CONFIDENCE_STYLE: Record<Confidence, { dot: string; text: string }> = {
  alta: { dot: "bg-success", text: "text-success-text" },
  media: { dot: "bg-warning", text: "text-warning-text" },
  baixa: { dot: "bg-danger", text: "text-danger-text" },
};
