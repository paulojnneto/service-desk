import { Hono } from "hono";

// Simulated ticket service (the "legacy system"), separate from the agent.
// The app is built by a function so tests can call app.request() without opening a port.
export function createApp() {
  const app = new Hono();

  app.get("/health", (c) => c.json({ status: "ok" }));

  return app;
}
