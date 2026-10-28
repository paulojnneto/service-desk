import { describe, expect, it } from "vitest";
import { createApp } from "./app";

// The tests run without NEXO_AGENT_MODEL, so the agent uses the simulated model.
describe("agent API", () => {
  const app = createApp();

  it("answers the health check", async () => {
    const res = await app.request("/health");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("streams the tool call and the reply in the format useChat consumes", async () => {
    const res = await app.request("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            id: "m1",
            role: "user",
            parts: [{ type: "text", text: "Qual o horário do service desk?" }],
          },
        ],
      }),
    });
    const events = parseEvents(await res.text());

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(events.some((e) => e.toolName === "consultarHorario")).toBe(true);
    // The reply arrives in pieces, one text-delta event per word, like a real model.
    const text = events.filter((e) => e.type === "text-delta").map((e) => e.delta);
    expect(text.length).toBeGreaterThan(1);
    expect(text.join("")).toContain("das 8h às 18h");
  });

  it("rejects a body that is not valid JSON", async () => {
    const res = await app.request("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_json" });
  });

  it("rejects POST requests that are not JSON (CSRF rule)", async () => {
    const res = await app.request("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "messages=x",
    });

    expect(res.status).toBe(415);
  });
});

type StreamEvent = { type: string; toolName?: string; delta?: string };

// Reads the server-sent events of a UI message stream ("data: {...}" lines).
function parseEvents(body: string): StreamEvent[] {
  return body
    .split("\n")
    .filter((line) => line.startsWith("data: {"))
    .map((line) => JSON.parse(line.slice("data: ".length)) as StreamEvent);
}
