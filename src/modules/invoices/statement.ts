import type { ReturnCondition } from "@/generated/prisma/enums";
import { fromDbDate } from "@/lib/dates";
import { toPaise } from "@/lib/money";
import { days, statementTotals } from "@/modules/billing/engine";

type Named = { name: string; nameMl: string | null };
type Decimalish = { toString(): string };

/** The parts of an order (as loaded by getOrder) that a statement needs. */
export type StatementSource = {
  issues: {
    issueDate: Date;
    lines: {
      id: number;
      status: "ACTIVE" | "VOIDED";
      quantity: number;
      qtyReturned: number;
      dailyRate: Decimalish;
      product: Named;
      unit: { serialNo: string } | null;
    }[];
  }[];
  returns: {
    status: "ACTIVE" | "VOIDED";
    returnDate: Date;
    lines: {
      id: number;
      issueLineId: number;
      quantity: number;
      condition: ReturnCondition;
      days: number;
      rentAmount: Decimalish;
      damageAmount: Decimalish;
      issueLine: { product: Named; unit: { serialNo: string } | null };
    }[];
  }[];
};

/**
 * Running statement of an order up to `today` (docs/01-requirements.md §3):
 * returned batches with their recorded rent and charges, plus rent accrued
 * to today on everything still out. Payments are added in Step 7.
 */
export function buildStatement(order: StatementSource, today: string) {
  const issueDateOf = new Map<number, string>();
  for (const i of order.issues) for (const l of i.lines) issueDateOf.set(l.id, fromDbDate(i.issueDate));

  const returned = order.returns
    .filter((r) => r.status === "ACTIVE")
    .flatMap((r) =>
      r.lines.map((l) => ({
        id: l.id,
        product: l.issueLine.product,
        serialNo: l.issueLine.unit?.serialNo ?? null,
        quantity: l.quantity,
        condition: l.condition,
        issueDate: issueDateOf.get(l.issueLineId) ?? "",
        returnDate: fromDbDate(r.returnDate),
        days: l.days,
        rent: toPaise(l.rentAmount),
        damage: toPaise(l.damageAmount),
      })),
    );

  const out = order.issues.flatMap((i) =>
    i.lines
      .filter((l) => l.status === "ACTIVE" && l.qtyReturned < l.quantity)
      .map((l) => ({
        id: l.id,
        product: l.product,
        serialNo: l.unit?.serialNo ?? null,
        qtyOutstanding: l.quantity - l.qtyReturned,
        ratePaise: toPaise(l.dailyRate),
        issueDate: fromDbDate(i.issueDate),
      })),
  );

  const totals = statementTotals(returned, out, today);
  return {
    today,
    returned,
    out: out.map((o, i) => ({ ...o, daysSoFar: days(o.issueDate, today), accrued: totals.accrued[i] })),
    returnedRent: totals.returnedRent,
    accruedRent: totals.accruedRent,
    damageTotal: totals.damageTotal,
    total: totals.total,
  };
}
export type Statement = ReturnType<typeof buildStatement>;
