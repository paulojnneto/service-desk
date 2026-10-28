import type { SessionUser } from "@nexo/shared";
import { describe, expect, it } from "vitest";
import { redirectFor } from "./guards";

const employee = { id: "ana.souza", role: "employee" } as SessionUser;
const analyst = { id: "rafael.lima", role: "analyst" } as SessionUser;

describe("redirectFor", () => {
  it.each([
    // area, signed out, employee, analyst
    ["public", null, "/", "/console"],
    ["employee", "/login", null, "/console"],
    ["analyst", "/login", "/", null],
  ] as const)("%s area", (area, signedOut, asEmployee, asAnalyst) => {
    expect(redirectFor(area, null)).toBe(signedOut);
    expect(redirectFor(area, employee)).toBe(asEmployee);
    expect(redirectFor(area, analyst)).toBe(asAnalyst);
  });
});
