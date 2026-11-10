/**
 * Where an order stands, in words staff act on. Derived from items and money,
 * never stored: the database only knows Open / Closed / Cancelled, and "Closed"
 * just means "invoiced" (the invoice may still be unpaid).
 *
 * PURE: no database, no clock.
 */
export type OrderStage = "out" | "partReturned" | "readyToBill" | "unpaid" | "paid" | "refundDue" | "cancelled";

export function orderStage(o: {
  status: "OPEN" | "CLOSED" | "CANCELLED";
  /** Pieces issued on active lines, and how many of them are still out. */
  total: number;
  out: number;
  /** Positive: the customer owes; negative: the shop holds an excess. */
  balance: number;
}): OrderStage {
  if (o.status === "CANCELLED") return "cancelled";
  if (o.status === "CLOSED") return o.balance > 0 ? "unpaid" : o.balance < 0 ? "refundDue" : "paid";
  // Open: an invoice needs every piece back, so "ready" means nothing is out.
  if (o.total > 0 && o.out === 0) return "readyToBill";
  if (o.out > 0 && o.out < o.total) return "partReturned";
  return "out";
}
