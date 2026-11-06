import { describe, expect, it } from "vitest";
import { applyDeltas, available, movementDeltas, type Counters } from "./stock";

const c = (owned: number, out = 0, repair = 0): Counters => ({ owned, out, repair });
const code = (fn: () => unknown) => {
  try {
    fn();
    return "ok";
  } catch (e) {
    return (e as { code: string }).code;
  }
};

describe("movementDeltas", () => {
  it("opening stock and purchases add to owned", () => {
    expect(movementDeltas(c(0), "OPENING", 50)).toEqual({ deltaOwned: 50, deltaRepair: 0 });
    expect(movementDeltas(c(10), "PURCHASE", 5)).toEqual({ deltaOwned: 5, deltaRepair: 0 });
  });

  it("write-off removes available stock only", () => {
    // 10 owned, 6 out, 2 in repair → 2 available
    expect(movementDeltas(c(10, 6, 2), "WRITE_OFF", 2)).toEqual({ deltaOwned: -2, deltaRepair: 0 });
    expect(code(() => movementDeltas(c(10, 6, 2), "WRITE_OFF", 3))).toBe("stock.notEnoughAvailable");
  });

  it("repair: send from available, return to available, or scrap from repair", () => {
    expect(movementDeltas(c(10, 0, 0), "SENT_TO_REPAIR", 4)).toEqual({ deltaOwned: 0, deltaRepair: 4 });
    expect(code(() => movementDeltas(c(10, 8, 0), "SENT_TO_REPAIR", 3))).toBe("stock.notEnoughAvailable");
    expect(movementDeltas(c(10, 0, 4), "REPAIR_DONE", 4)).toEqual({ deltaOwned: 0, deltaRepair: -4 });
    expect(code(() => movementDeltas(c(10, 0, 4), "REPAIR_DONE", 5))).toBe("stock.notEnoughInRepair");
    expect(movementDeltas(c(10, 0, 4), "REPAIR_SCRAPPED", 1)).toEqual({ deltaOwned: -1, deltaRepair: -1 });
    expect(code(() => movementDeltas(c(10, 0, 0), "REPAIR_SCRAPPED", 1))).toBe("stock.notEnoughInRepair");
  });

  it("corrections go either way, never below what is out or in repair", () => {
    expect(movementDeltas(c(10), "CORRECTION", 3, true)).toEqual({ deltaOwned: 3, deltaRepair: 0 });
    expect(movementDeltas(c(10, 5), "CORRECTION", 5, false)).toEqual({ deltaOwned: -5, deltaRepair: 0 });
    expect(code(() => movementDeltas(c(10, 5), "CORRECTION", 6, false))).toBe("stock.notEnoughAvailable");
  });

  it("rejects zero, negative and fractional quantities", () => {
    for (const q of [0, -1, 1.5]) expect(code(() => movementDeltas(c(10), "PURCHASE", q))).toBe("stock.qtyPositive");
  });

  it("no valid sequence can break the stock balance", () => {
    let s = c(0);
    const steps = [
      ["OPENING", 20],
      ["SENT_TO_REPAIR", 5],
      ["WRITE_OFF", 15],
      ["REPAIR_SCRAPPED", 2],
      ["REPAIR_DONE", 3],
      ["PURCHASE", 1],
    ] as const;
    for (const [type, qty] of steps) {
      s = applyDeltas(s, movementDeltas(s, type, qty));
      expect(s.out + s.repair).toBeLessThanOrEqual(s.owned);
      expect(available(s)).toBeGreaterThanOrEqual(0);
    }
    expect(s).toEqual(c(4, 0, 0));
  });
});
