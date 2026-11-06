import { DomainError } from "@/lib/errors";

/**
 * Pure stock rules (no DB). Every manual stock change goes through
 * `movementDeltas`, which validates it against the current counters and
 * returns what to add to qty_owned / qty_repair. The database CHECK
 * `qty_out + qty_repair <= qty_owned` is the backstop (docs/02-architecture.md §6).
 */
export type Counters = { owned: number; out: number; repair: number };

export const available = (c: Counters) => c.owned - c.out - c.repair;

/** Movement types an admin can record by hand (RETURN_* come from returns in Step 5). */
export const MANUAL_MOVEMENTS = [
  "OPENING",
  "PURCHASE",
  "WRITE_OFF",
  "SENT_TO_REPAIR",
  "REPAIR_DONE",
  "REPAIR_SCRAPPED",
  "CORRECTION",
] as const;
export type ManualMovement = (typeof MANUAL_MOVEMENTS)[number];

/** Movements that must carry a reason (also enforced by a DB CHECK). */
export const REASON_REQUIRED: readonly ManualMovement[] = ["WRITE_OFF", "REPAIR_SCRAPPED", "CORRECTION"];

export type Deltas = { deltaOwned: number; deltaRepair: number };

/**
 * @param qty      positive quantity
 * @param increase only for CORRECTION: true adds to owned stock, false removes from it
 */
export function movementDeltas(c: Counters, type: ManualMovement, qty: number, increase = true): Deltas {
  if (!Number.isInteger(qty) || qty <= 0) throw new DomainError("stock.qtyPositive");
  const needAvailable = () => {
    if (available(c) < qty) throw new DomainError("stock.notEnoughAvailable", { available: available(c) });
  };
  const needRepair = () => {
    if (c.repair < qty) throw new DomainError("stock.notEnoughInRepair", { repair: c.repair });
  };
  switch (type) {
    case "OPENING":
    case "PURCHASE":
      return { deltaOwned: qty, deltaRepair: 0 };
    case "WRITE_OFF":
      needAvailable();
      return { deltaOwned: -qty, deltaRepair: 0 };
    case "SENT_TO_REPAIR":
      needAvailable();
      return { deltaOwned: 0, deltaRepair: qty };
    case "REPAIR_DONE":
      needRepair();
      return { deltaOwned: 0, deltaRepair: -qty };
    case "REPAIR_SCRAPPED":
      needRepair();
      return { deltaOwned: -qty, deltaRepair: -qty };
    case "CORRECTION":
      if (increase) return { deltaOwned: qty, deltaRepair: 0 };
      needAvailable();
      return { deltaOwned: -qty, deltaRepair: 0 };
  }
}

export function applyDeltas(c: Counters, d: Deltas): Counters {
  return { owned: c.owned + d.deltaOwned, out: c.out, repair: c.repair + d.deltaRepair };
}

/** Unit status changes for serialised products, as manual movements. */
export const UNIT_TRANSITIONS = {
  SENT_TO_REPAIR: { from: "AVAILABLE", to: "UNDER_REPAIR" },
  REPAIR_DONE: { from: "UNDER_REPAIR", to: "AVAILABLE" },
  WRITE_OFF: { from: "AVAILABLE", to: "RETIRED" },
  REPAIR_SCRAPPED: { from: "UNDER_REPAIR", to: "RETIRED" },
} as const;
export type UnitAction = keyof typeof UNIT_TRANSITIONS;
export const UNIT_ACTIONS = Object.keys(UNIT_TRANSITIONS) as UnitAction[];
