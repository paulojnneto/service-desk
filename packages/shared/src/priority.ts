import { z } from "zod";
import type { Priority } from "./service-desk";
import { Affected } from "./tickets";

// Priority combines impact and urgency (Annex A, R9). The model only gathers the two
// answers; this table decides (stage 6 PRD, decision 2).

// Who is affected: the same values the ticket stores as "affected".
export const Impact = Affected;
export type Impact = z.infer<typeof Impact>;

export const Urgency = z.enum([
  "parado", // stopped: cannot work at all
  "compromisso_hoje", // a commitment today is at risk
  "contornavel", // gets in the way, but there is a workaround
  "sem_urgencia", // a request or improvement with no urgency
]);
export type Urgency = z.infer<typeof Urgency>;

// Critical: down for a team or the company. High: one person cannot work, or a commitment
// today. Medium: there is a workaround. Low: no urgency.
export function priorityFor(impact: Impact, urgency: Urgency): Priority {
  switch (urgency) {
    case "parado":
      return impact === "so_eu" ? "alta" : "critica";
    case "compromisso_hoje":
      return "alta";
    case "contornavel":
      return "media";
    case "sem_urgencia":
      return "baixa";
  }
}
