import { describe, expect, it } from "vitest";
import { priorityFor, type Impact, type Urgency } from "./priority";

describe("priorityFor", () => {
  const cases: [Impact, Urgency, string][] = [
    ["so_eu", "parado", "alta"],
    ["equipe", "parado", "critica"],
    ["empresa", "parado", "critica"],
    ["so_eu", "compromisso_hoje", "alta"],
    ["equipe", "compromisso_hoje", "alta"],
    ["empresa", "compromisso_hoje", "alta"],
    ["so_eu", "contornavel", "media"],
    ["equipe", "contornavel", "media"],
    ["empresa", "contornavel", "media"],
    ["so_eu", "sem_urgencia", "baixa"],
    ["equipe", "sem_urgencia", "baixa"],
    ["empresa", "sem_urgencia", "baixa"],
  ];

  it.each(cases)("%s + %s → %s", (impact, urgency, priority) => {
    expect(priorityFor(impact, urgency)).toBe(priority);
  });
});
