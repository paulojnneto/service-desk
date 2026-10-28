import { z } from "zod";

// Service desk vocabulary (Annex A of the challenge).
// Values are in Portuguese because they are shown in the UI and stored with the tickets.

export const TicketType = z.enum(["INC", "REQ"]);
export type TicketType = z.infer<typeof TicketType>;

export const Category = z.enum(["Acesso", "Rede e VPN", "Hardware", "Software", "E-mail", "Outros"]);
export type Category = z.infer<typeof Category>;

export const Priority = z.enum(["critica", "alta", "media", "baixa"]);
export type Priority = z.infer<typeof Priority>;

type Sla = { label: string; amount: number; unit: "hours" | "business_hours" | "business_days" };

// The deadline applies to the first response and to each update.
export const SLA_BY_PRIORITY: Record<Priority, Sla> = {
  critica: { label: "Crítica", amount: 1, unit: "hours" },
  alta: { label: "Alta", amount: 4, unit: "business_hours" },
  media: { label: "Média", amount: 3, unit: "business_days" },
  baixa: { label: "Baixa", amount: 5, unit: "business_days" },
};
