import { notFound } from "next/navigation";
import { businessToday, formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { requirePagePermission } from "@/modules/auth/session";
import { formatPhone } from "@/modules/customers/phone";
import { buildStatement } from "@/modules/invoices/statement";
import { getOrder } from "@/modules/orders/queries";
import { orderPayments, sumPayments } from "@/modules/payments/queries";
import { L, Row, Slip } from "../../slip";

export const metadata = { title: "Statement" };

/** Running statement of an order up to today. The id is the order id. */
export default async function PrintStatement({ params }: PageProps<"/print/statement/[id]">) {
  await requirePagePermission("statement.print");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const order = await getOrder(id);
  if (!order) notFound();
  const today = businessToday();
  const s = buildStatement(order, today);
  const money = sumPayments(await orderPayments(id));
  const name = (p: { name: string; nameMl: string | null }, serial: string | null) =>
    `${p.nameMl ? `${p.nameMl} / ${p.name}` : p.name}${serial ? ` ${serial}` : ""}`;

  return (
    <Slip title="statement">
      <Row k="order">{order.orderNo}</Row>
      <Row k="asOf">{formatDate(today)}</Row>
      <Row k="customer">{order.customer.name}</Row>
      <Row k="phone">{formatPhone(order.customer.phone)}</Row>
      {order.siteAddress && <Row k="site">{order.siteAddress}</Row>}
      {s.out.length > 0 && (
        <>
          <hr />
          <div className="name">
            <L k="stillOut" />
          </div>
          {s.out.map((o) => (
            <div key={o.id} className="item">
              <div className="name">{name(o.product, o.serialNo)}</div>
              <div className="muted">
                <L k="issued" /> {formatDate(o.issueDate)}
              </div>
              <div className="row">
                <span>
                  {o.qtyOutstanding} × {formatINR(o.ratePaise)} × {o.daysSoFar} <L k="days" />
                </span>
                <span className="value">{formatINR(o.accrued)}</span>
              </div>
            </div>
          ))}
        </>
      )}
      {s.returned.length > 0 && (
        <>
          <hr />
          <div className="name">
            <L k="returned" />
          </div>
          {s.returned.map((r) => (
            <div key={r.id} className="item">
              <div className="name">{name(r.product, r.serialNo)}</div>
              <div className="muted">
                {formatDate(r.issueDate)} → {formatDate(r.returnDate)}
              </div>
              <div className="row">
                <span>
                  {r.quantity} · {r.days} <L k="days" />
                </span>
                <span className="value">{formatINR(r.rent)}</span>
              </div>
              {r.damage > 0 && (
                <div className="row">
                  <span>
                    <L k="charge" />
                  </span>
                  <span className="value">{formatINR(r.damage)}</span>
                </div>
              )}
            </div>
          ))}
        </>
      )}
      <hr />
      <Row k="rentSoFar">{formatINR(s.returnedRent + s.accruedRent)}</Row>
      {s.damageTotal > 0 && <Row k="damage">{formatINR(s.damageTotal)}</Row>}
      <Row k="total" strong>
        {formatINR(s.total)}
      </Row>
      <Row k="received">{formatINR(money.received)}</Row>
      {money.refunded > 0 && <Row k="refunded">{formatINR(money.refunded)}</Row>}
      <Row k="balance" strong>
        {formatINR(s.total - money.received + money.refunded)}
      </Row>
    </Slip>
  );
}
