import { TZDate } from "@date-fns/tz";
import { TIME_ZONE, type Ticket } from "@nexo/shared";
import { describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createTestDb } from "../db/test-db";
import { signTestToken, testKeys } from "../test-tokens";
import { seedDatabase } from "./seed";

// The scenarios must hold whatever day the seed runs: a Wednesday morning and a Saturday night.
const MOMENTS = {
  "Wednesday 10:00": new Date(new TZDate(2026, 9, 28, 10, 0, TIME_ZONE).getTime()),
  "Saturday 23:00": new Date(new TZDate(2026, 9, 31, 23, 0, TIME_ZONE).getTime()),
};

describe.each(Object.entries(MOMENTS))("sample data seeded on %s", (_label, now) => {
  async function setup() {
    const db = await createTestDb();
    await seedDatabase(db, now);
    const keys = await testKeys();
    const app = createApp({ db, tokenPublicKey: keys.publicKey, now: () => now });
    return async (requesterId: string, path: string) => {
      const token = await signTestToken(keys.privateKey, requesterId);
      const res = await app.request(path, { headers: { authorization: `Bearer ${token}` } });
      return res.json() as Promise<{
        tickets: Ticket[];
        ticket: Ticket;
        articles: { id: string }[];
      }>;
    };
  }

  it("gives Ana the prototype's tickets, with only INC-20311 overdue", async () => {
    const get = await setup();
    const { tickets } = await get("ana.souza", "/tickets");
    const byNumber = Object.fromEntries(tickets.map((t) => [t.number, t]));

    expect(
      tickets
        .map((t) => t.number)
        .slice(0, 3)
        .sort(),
    ).toEqual(["INC-20298", "INC-20311", "REQ-10442"]);
    expect(tickets.filter((t) => t.overdue).map((t) => t.number)).toEqual(["INC-20311"]);
    expect(byNumber["REQ-10442"]?.status).toBe("aprovado");
  });

  it("lets INC-20150 be reopened but not the old resolved tickets", async () => {
    const get = await setup();
    const { tickets } = await get("ana.souza", "/tickets");
    const reopenable = tickets.filter((t) => t.canReopen).map((t) => t.number);

    expect(reopenable).toEqual(["INC-20150"]);
  });

  it("keeps other employees' tickets out of Ana's reach", async () => {
    const get = await setup();
    const carla = await get("carla.mendes", "/tickets");
    const asAna = await get("ana.souza", "/tickets/REQ-10439");

    expect(carla.tickets.map((t) => t.number)).toEqual(["REQ-10439"]);
    expect(asAna).toEqual({ error: "not_found" });
  });

  it("loads the help center articles", async () => {
    const get = await setup();
    const { articles } = await get("ana.souza", "/articles/search?q=vpn%20809");

    expect(articles[0]?.id).toBe("vpn-erro-809");
  });
});
