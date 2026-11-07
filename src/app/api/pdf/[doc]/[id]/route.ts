import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ForbiddenError } from "@/lib/errors";
import type { Permission } from "@/lib/permissions";
import { requireActionPermission } from "@/modules/auth/session";
import { renderPdf } from "@/modules/print/pdf";

const DOCS: Record<string, { permission: Permission; name: (id: number) => Promise<string | null> }> = {
  invoice: {
    permission: "invoice.create",
    name: async (id) => (await db.invoice.findUnique({ where: { id }, select: { invoiceNo: true } }))?.invoiceNo ?? null,
  },
  statement: {
    permission: "statement.print",
    name: async (id) => {
      const o = await db.rentalOrder.findUnique({ where: { id }, select: { orderNo: true } });
      return o ? `Statement ${o.orderNo}` : null;
    },
  },
  receipt: {
    permission: "receipt.print",
    name: async (id) => (await db.payment.findUnique({ where: { id }, select: { receiptNo: true } }))?.receiptNo ?? null,
  },
};

/** GET /api/pdf/{invoice|statement|receipt}/{id} → the print page as a PDF, e.g. for sharing on WhatsApp. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/pdf/[doc]/[id]">) {
  const { doc, id: rawId } = await ctx.params;
  const spec = DOCS[doc];
  const id = Number(rawId);
  if (!spec || !Number.isInteger(id) || id <= 0) return new Response("Not found", { status: 404 });
  try {
    await requireActionPermission(spec.permission);
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response("Forbidden", { status: 403 });
    throw e;
  }
  const docName = await spec.name(id);
  if (!docName) return new Response("Not found", { status: 404 });

  const settings = await db.settings.findUnique({ where: { id: 1 }, select: { printPaperWidthMm: true } });
  // The server renders its own page over loopback. Never derive this from the
  // request's Host header (client-controlled → SSRF). INTERNAL_BASE_URL overrides it.
  const base = process.env.INTERNAL_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
  const pdf = await renderPdf(`${base}/print/${doc}/${id}`, req.headers.get("cookie") ?? "", settings?.printPaperWidthMm ?? 80);
  const file = `${docName.replace(/[^\w.-]+/g, "-")}.pdf`;
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
