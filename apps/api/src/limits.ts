import { TZDate } from "@date-fns/tz";
import { TIME_ZONE } from "@nexo/shared";

// Usage limits (stage 11 PRD, S-11.6 to S-11.8): agent turns per employee per day, and an
// estimated cost for all agent turns per day. Both come from the environment; 0 turns a limit
// off. The day follows São Paulo time, like the deadlines.

export type Limits = { turnsPerDay: number; dailyBudgetUsd: number };

export const DEFAULT_LIMITS: Limits = { turnsPerDay: 40, dailyBudgetUsd: 5 };

export function readLimits(env: Record<string, string | undefined> = process.env): Limits {
  const number = (value: string | undefined, fallback: number) => {
    if (value === undefined || value.trim() === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };
  return {
    turnsPerDay: number(env.NEXO_AGENT_TURNS_PER_DAY, DEFAULT_LIMITS.turnsPerDay),
    dailyBudgetUsd: number(env.NEXO_DAILY_BUDGET_USD, DEFAULT_LIMITS.dailyBudgetUsd),
  };
}

export type UsageToday = { employeeTurns: number; costUsd: number };

export type LimitReached = "employee" | "budget";

export function limitReached(usage: UsageToday, limits: Limits): LimitReached | null {
  if (limits.dailyBudgetUsd > 0 && usage.costUsd >= limits.dailyBudgetUsd) return "budget";
  if (limits.turnsPerDay > 0 && usage.employeeTurns >= limits.turnsPerDay) return "employee";
  return null;
}

// Midnight in São Paulo, the start of the day the limits count.
export function startOfDay(now: Date): Date {
  const local = new TZDate(now.getTime(), TIME_ZONE);
  local.setHours(0, 0, 0, 0);
  return new Date(local.getTime());
}

// A request for a person still reaches one past a limit (PRD decision 7), without the model.
export function asksForPerson(text: string): boolean {
  const plain = text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  return /analista|atendente|humano|falar com (uma |alguma )?pessoa|falar com alguem/.test(plain);
}

export const LIMIT_TEXT: Record<LimitReached, string> = {
  employee:
    "Você atingiu o limite de mensagens com o assistente por hoje; ele volta amanhã. Se precisar de alguém agora, escreva 'quero falar com um analista'.",
  budget:
    "O assistente está pausado por hoje. Se precisar de ajuda agora, escreva 'quero falar com um analista' e a equipe do service desk responde por aqui.",
};

export const HANDOFF_PAST_LIMIT_TEXT =
  "Pronto, chamei a equipe do service desk. Um analista vai responder por aqui.";
