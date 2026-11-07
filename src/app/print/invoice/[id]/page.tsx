import { notFound } from "next/navigation";
import { formatDate, fromDbDate } from "@/lib/dates";
import { formatINR, toPaise } from "@/lib/money";
import { requirePagePermission } from "@/modules/auth/session";
import { formatPhone } from "@/modules/customers/phone";
import { getInvoice } from "@/modules/invoices/queries";
import { orderPayments, sumPayments } from "@/modules/payments/queries";
import { L, Row, Slip } from "../../slip";

export const metadata = { title: "Invoice" };

/** Final invoice slip, rendered only from the stored snapshot so it reprints exactly as issued. */
export default async function PrintInvoice({ params }: PageProps<"/print/invoice/[id]">) {
  await requirePagePermission("invoice.create");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const inv = await getInvoice(id);
  if (!inv) notFound();
  const cancelled = inv.status === "CANCELLED";
  const money = cancelled ? null : sumPayments(await orderPayments(inv.order.id));
  const total = toPaise(inv.total);
  const discount = toPaise(inv.discountAmount);

  return (
    <Slip title="invoice" banner={cancelled ? "cancelled" : null}>
      <Row k="no">{inv.invoiceNo}</Row>
      <Row k="date">{formatDate(fromDbDate(inv.invoiceDate))}</Row>
      <Row k="order">{inv.orderNo}</Row>
      <Row k="customer">{inv.customerName}</Row>
      <Row k="phone">{formatPhone(inv.customerPhone)}</Row>
      {inv.siteAddress && <Row k="site">{inv.siteAddress}</Row>}
      <hr />
      {inv.lines.map((l) => (
        <div key={l.id} className="item">
          <div className="name">
            {l.productNameMl ? `${l.productNameMl} / ${l.productName}` : l.productName}
            {l.serialNo && ` ${l.serialNo}`}
          </div>
          <div className="muted">
            {formatDate(fromDbDate(l.issueDate))} → {formatDate(fromDbDate(l.returnDate))}
          </div>
          <div className="row">
            <span>
              {l.quantity} × {formatINR(toPaise(l.dailyRate))} × {l.days} <L k="days" />
            </span>
            <span className="value">{formatINR(toPaise(l.rentAmount))}</span>
          </div>
          {toPaise(l.damageAmount) > 0 && (
            <div className="row">
              <span>
                <L k="charge" />
                {l.damageNote && ` (${l.damageNote})`}
              </span>
              <span className="value">{formatINR(toPaise(l.damageAmount))}</span>
            </div>
          )}
        </div>
      ))}
      <hr />
      <Row k="rent">{formatINR(toPaise(inv.rentTotal))}</Row>
      {toPaise(inv.damageTotal) > 0 && <Row k="damage">{formatINR(toPaise(inv.damageTotal))}</Row>}
      {discount > 0 && (
        <>
          <Row k="subtotal">{formatINR(toPaise(inv.rentTotal) + toPaise(inv.damageTotal))}</Row>
          <Row k="discount">− {formatINR(discount)}</Row>
        </>
      )}
      <Row k="total" strong>
        {formatINR(total)}
      </Row>
      {money && (
        <>
          <Row k="received">{formatINR(money.received)}</Row>
          {money.refunded > 0 && <Row k="refunded">{formatINR(money.refunded)}</Row>}
          <Row k="balance" strong>
            {formatINR(total - money.received + money.refunded)}
          </Row>
        </>
      )}
    </Slip>
  );
}
