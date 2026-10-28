import { describe, expect, it } from "vitest";
import { mastra } from "..";

// Runs the real agent (Mastra and its tools) with the simulated model: no network, no key.
describe("Nexo Assist in simulated mode", () => {
  const agent = mastra.getAgent("nexoAssist");

  it("calls the hours tool and answers with its result", async () => {
    const result = await agent.generate("Qual o horário do service desk?");

    expect(result.toolCalls.map((call) => call.payload.toolName)).toEqual([
      "consultarHorario",
      "registrarDecisao",
    ]);
    expect(result.text).toContain("das 8h às 18h");
  });

  it("records low confidence and asks again when it does not understand the request", async () => {
    const result = await agent.generate("Oi");

    expect(result.toolCalls.map((call) => call.payload.toolName)).toEqual(["registrarDecisao"]);
    expect(result.toolCalls[0]?.payload.args).toMatchObject({ confianca: "baixa" });
    expect(result.text).toContain("modo simulado");
  });
});
