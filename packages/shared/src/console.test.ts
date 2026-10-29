import { describe, expect, it } from "vitest";
import { consoleEmployee, HANDOFF_REASON_LABELS, HandoffReason, holderFor } from "./console";

describe("holderFor", () => {
  it("names an analyst with their level, and nobody else", () => {
    expect(holderFor("rafael.lima")).toEqual({
      id: "rafael.lima",
      name: "Rafael Lima",
      level: "Suporte N2",
    });
    expect(holderFor("ana.souza")).toBeNull();
    expect(holderFor(null)).toBeNull();
  });
});

describe("consoleEmployee", () => {
  it("gives the console an employee's name, department, initials and colors", () => {
    expect(consoleEmployee("bruno.tavares")).toMatchObject({
      name: "Bruno Tavares",
      department: "Marketing",
      initials: "BT",
    });
    expect(consoleEmployee("rafael.lima")).toBeNull();
  });
});

describe("HANDOFF_REASON_LABELS", () => {
  it("labels every reason", () => {
    for (const reason of HandoffReason.options) expect(HANDOFF_REASON_LABELS[reason]).toBeTruthy();
  });
});
