import { describe, expect, it } from "vitest";
import { allowedActions } from "./actions";

const rafael = { id: "rafael.lima", name: "Rafael Lima", level: "Suporte N2" };
const julia = { id: "julia.castro", name: "Júlia Castro", level: "Suporte N1" };

describe("allowedActions", () => {
  it("lets anyone take over, hand back or close a waiting conversation, but not reply", () => {
    expect(allowedActions("waiting_analyst", null, "rafael.lima")).toEqual({
      takeOver: true,
      reply: false,
      handBack: true,
      close: true,
      heldBy: null,
    });
  });

  it("lets the holder reply, hand back and close", () => {
    expect(allowedActions("with_analyst", rafael, "rafael.lima")).toEqual({
      takeOver: false,
      reply: true,
      handBack: true,
      close: true,
      heldBy: null,
    });
  });

  it("only says who holds it to the other analysts", () => {
    expect(allowedActions("with_analyst", julia, "rafael.lima")).toEqual({
      takeOver: false,
      reply: false,
      handBack: false,
      close: false,
      heldBy: julia,
    });
  });

  it("lets anyone take over from the agent, and nothing once closed", () => {
    expect(allowedActions("with_agent", null, "rafael.lima")).toMatchObject({
      takeOver: true,
      reply: false,
      close: false,
    });
    expect(Object.values(allowedActions("closed", null, "rafael.lima")).filter(Boolean)).toEqual(
      [],
    );
  });
});
