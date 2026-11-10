import { describe, expect, it } from "vitest";
import { orderStage } from "./stage";

describe("orderStage", () => {
  const open = { status: "OPEN" as const, balance: 0 };

  it("open orders: out, part returned, ready to bill", () => {
    expect(orderStage({ ...open, total: 10, out: 10 })).toBe("out");
    expect(orderStage({ ...open, total: 10, out: 7 })).toBe("partReturned");
    expect(orderStage({ ...open, total: 10, out: 0 })).toBe("readyToBill");
  });

  it("an open order with nothing on it is not ready to bill", () => {
    expect(orderStage({ ...open, total: 0, out: 0 })).toBe("out");
  });

  it("invoiced orders follow the balance: owes, settled, excess held", () => {
    const closed = { status: "CLOSED" as const, total: 4, out: 0 };
    expect(orderStage({ ...closed, balance: 25_000 })).toBe("unpaid");
    expect(orderStage({ ...closed, balance: 0 })).toBe("paid");
    expect(orderStage({ ...closed, balance: -10_000 })).toBe("refundDue");
  });

  it("cancelled wins over everything", () => {
    expect(orderStage({ status: "CANCELLED", total: 3, out: 3, balance: 500 })).toBe("cancelled");
  });
});
