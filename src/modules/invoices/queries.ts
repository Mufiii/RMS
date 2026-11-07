import "server-only";
import { db } from "@/lib/db";

export function getInvoice(id: number) {
  return db.invoice.findUnique({
    where: { id },
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
      order: { select: { id: true, customerId: true, status: true } },
      createdBy: { select: { fullName: true } },
      cancelledBy: { select: { fullName: true } },
    },
  });
}

/** Every invoice of an order, live and cancelled, newest first. */
export function orderInvoices(orderId: number) {
  return db.invoice.findMany({
    where: { orderId },
    orderBy: { id: "desc" },
    select: { id: true, invoiceNo: true, status: true, invoiceDate: true, total: true, discountAmount: true, cancelReason: true },
  });
}
