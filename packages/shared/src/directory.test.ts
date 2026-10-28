import { describe, expect, it } from "vitest";
import { findPersonByEmail, findPersonById, initials } from "./directory";

describe("directory", () => {
  it("finds a person ignoring case and surrounding spaces", () => {
    expect(findPersonByEmail("  Ana.Souza@NEXO.com.br ")?.name).toBe("Ana Souza");
  });

  it("does not find emails outside the directory", () => {
    expect(findPersonByEmail("someone@gmail.com")).toBeUndefined();
    expect(findPersonByEmail("")).toBeUndefined();
  });

  it("finds a person by id", () => {
    expect(findPersonById("rafael.lima")?.role).toBe("analyst");
    expect(findPersonById("nobody")).toBeUndefined();
  });

  it("builds initials from the first and last names", () => {
    expect(initials("Ana Souza")).toBe("AS");
    expect(initials("Maria da Silva Prado")).toBe("MP");
    expect(initials("Rafael")).toBe("R");
  });
});
