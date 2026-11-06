// Pure helpers that are safe to import from pages and client components
// (no database access). The stock rules themselves live in ./stock.ts.
export { available, MANUAL_MOVEMENTS, REASON_REQUIRED, UNIT_ACTIONS, UNIT_TRANSITIONS } from "./stock";
export type { Counters, ManualMovement, UnitAction } from "./stock";

export const countersOf = (p: { qtyOwned: number; qtyOut: number; qtyRepair: number }) => ({
  owned: p.qtyOwned,
  out: p.qtyOut,
  repair: p.qtyRepair,
});
