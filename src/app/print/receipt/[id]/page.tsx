import { notFound } from "next/navigation";
import en from "@/i18n/messages/en.json";
import ml from "@/i18n/messages/ml.json";
import { formatDate, fromDbDate } from "@/lib/dates";
import { formatINR, toPaise } from "@/lib/money";
import { requirePagePermission } from "@/modules/auth/session";
import { formatPhone } from "@/modules/customers/phone";
import { getPayment } from "@/modules/payments/queries";
import { Row, Slip } from "../../slip";

export const metadata = { title: "Receipt" };

/** Payment receipt (RCP/…) or refund voucher (RFD/…). */
export default async function PrintReceipt({ params }: PageProps<"/print/receipt/[id]">) {
  await requirePagePermission("receipt.print");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const p = await getPayment(id);
  if (!p) notFound();
  const isRefund = p.type === "REFUND";

  return (
    <Slip title={isRefund ? "refundVoucher" : "receipt"} banner={p.status === "VOIDED" ? "voided" : null}>
      <Row k="no">{p.receiptNo}</Row>
      <Row k="date">{formatDate(fromDbDate(p.paymentDate))}</Row>
      <Row k="order">{p.order.orderNo}</Row>
      <Row k="customer">{p.customer.name}</Row>
      <Row k="phone">{formatPhone(p.customer.phone)}</Row>
      <hr />
      <Row k="mode">
        {ml.payments.mode[p.mode]} / {en.payments.mode[p.mode]}
      </Row>
      {p.reference && <Row k="reference">{p.reference}</Row>}
      <div className="muted">
        {ml.payments.type[p.type]} / {en.payments.type[p.type]}
      </div>
      <Row k={isRefund ? "refunded" : "received"} strong>
        {formatINR(toPaise(p.amount))}
      </Row>
      {p.notes && <div className="muted">{p.notes}</div>}
      <hr />
      <Row k="receivedBy">{p.receivedBy.fullName}</Row>
    </Slip>
  );
}
