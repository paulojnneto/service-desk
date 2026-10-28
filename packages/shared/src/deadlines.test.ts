import { TZDate } from "@date-fns/tz";
import { afterEach, describe, expect, it } from "vitest";
import { canReopen, dueAt, isOverdue, TIME_ZONE } from "./deadlines";

// A moment in São Paulo time. October 2026: the 26th is a Monday, the 28th a Wednesday,
// the 30th a Friday, the 31st a Saturday.
function sp(month: number, day: number, hour: number, minute = 0): Date {
  return new Date(new TZDate(2026, month - 1, day, hour, minute, TIME_ZONE).getTime());
}

describe("dueAt", () => {
  it.each([
    ["inside business hours", sp(10, 28, 10), sp(10, 28, 14)],
    ["crossing 18:00", sp(10, 28, 16), sp(10, 29, 10)],
    ["from Friday evening to Monday", sp(10, 30, 17), sp(11, 2, 11)],
    ["from Saturday, starting Monday at 8:00", sp(10, 31, 12), sp(11, 2, 12)],
    ["before 8:00 on a weekday", sp(10, 28, 6), sp(10, 28, 12)],
  ])("high priority: 4 business hours %s", (_case, from, expected) => {
    expect(dueAt("alta", from)).toEqual(expected);
  });

  it("medium priority: 3 business days later at the same time", () => {
    expect(dueAt("media", sp(10, 28, 10))).toEqual(sp(11, 2, 10));
  });

  it("medium priority after hours starts at the next business moment", () => {
    expect(dueAt("media", sp(10, 30, 19))).toEqual(sp(11, 5, 8));
  });

  it("low priority: 5 business days later", () => {
    expect(dueAt("baixa", sp(10, 26, 9))).toEqual(sp(11, 2, 9));
  });

  it("critical priority: 1 wall-clock hour, even at night and on weekends", () => {
    expect(dueAt("critica", sp(10, 31, 23, 30))).toEqual(sp(11, 1, 0, 30));
  });
});

describe("isOverdue", () => {
  const now = sp(10, 28, 10);

  it("is true for an open ticket past its deadline", () => {
    const sixDaysAgo = sp(10, 22, 10);
    expect(
      isOverdue(
        { priority: "media", status: "aguardando_analista", lastUpdateAt: sixDaysAgo },
        now,
      ),
    ).toBe(true);
  });

  it("is false for an open ticket within its deadline", () => {
    expect(
      isOverdue({ priority: "media", status: "em_andamento", lastUpdateAt: sp(10, 27, 10) }, now),
    ).toBe(false);
  });

  it("is never true for resolved or closed tickets", () => {
    const longAgo = sp(9, 1, 10);
    expect(isOverdue({ priority: "alta", status: "resolvido", lastUpdateAt: longAgo }, now)).toBe(
      false,
    );
    expect(isOverdue({ priority: "alta", status: "fechado", lastUpdateAt: longAgo }, now)).toBe(
      false,
    );
  });
});

describe("canReopen", () => {
  const now = sp(10, 28, 10);

  it("allows tickets resolved up to 7 calendar days ago", () => {
    expect(canReopen({ status: "resolvido", resolvedAt: sp(10, 24, 10) }, now)).toBe(true);
    expect(canReopen({ status: "resolvido", resolvedAt: sp(10, 21, 10) }, now)).toBe(true);
  });

  it("refuses tickets resolved longer ago, and tickets that are not resolved", () => {
    expect(canReopen({ status: "resolvido", resolvedAt: sp(10, 20, 9) }, now)).toBe(false);
    expect(canReopen({ status: "em_andamento", resolvedAt: null }, now)).toBe(false);
  });
});

describe("time zone", () => {
  const original = process.env.TZ;
  afterEach(() => {
    process.env.TZ = original;
  });

  it("gives the same deadlines whatever the server's time zone", () => {
    process.env.TZ = "Asia/Tokyo";
    expect(dueAt("alta", sp(10, 28, 16))).toEqual(sp(10, 29, 10));
    expect(dueAt("media", sp(10, 28, 10))).toEqual(sp(11, 2, 10));
  });
});
