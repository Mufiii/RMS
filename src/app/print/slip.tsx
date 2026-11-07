import type { ReactNode } from "react";
import en from "@/i18n/messages/en.json";
import ml from "@/i18n/messages/ml.json";
import { db } from "@/lib/db";
import { PrintButton } from "./print-button";

export type PrintKey = keyof typeof en.print;

/** Printed documents are always bilingual, whatever the screen language (docs/01 §8): "മലയാളം English". */
export function L({ k }: { k: PrintKey }) {
  return (
    <>
      <span>{ml.print[k]}</span> <span className="en">{en.print[k]}</span>
    </>
  );
}

/** Label/value row; long values wrap under a narrow roll width. */
export function Row({ k, children, strong }: { k: PrintKey; children: ReactNode; strong?: boolean }) {
  return (
    <div className={strong ? "row strong" : "row"}>
      <span className="label">
        <L k={k} />
      </span>
      <span className="value">{children}</span>
    </div>
  );
}

/**
 * A thermal-roll slip (docs/02-architecture.md §8): 80 mm paper (≈72 mm
 * printable) or 58 mm, single column, as long as the content.
 */
export async function Slip({ title, banner, children }: { title: PrintKey; banner?: PrintKey | null; children: ReactNode }) {
  const s = await db.settings.findUnique({ where: { id: 1 } });
  const width = s?.printPaperWidthMm ?? 80;
  const content = width === 58 ? 48 : 72;
  return (
    <>
      <style>{`
        @page { margin: 0; }
        html, body { background: #fff !important; color: #000 !important; }
        .slip { width: ${content}mm; margin: 0 auto; padding: 3mm ${(width - content) / 2}mm 6mm; font-size: 11px; line-height: 1.35; }
        .slip h1 { font-size: 15px; font-weight: 700; text-align: center; margin: 0; }
        .slip .center { text-align: center; }
        .slip .muted { color: #333; }
        .slip .en { color: #333; }
        .slip hr { border: 0; border-top: 1px dashed #000; margin: 2mm 0; }
        .slip .doc { text-align: center; font-weight: 700; font-size: 13px; margin: 1mm 0; }
        .slip .row { display: flex; justify-content: space-between; gap: 2mm; }
        .slip .row .value { text-align: right; font-variant-numeric: tabular-nums; }
        .slip .strong { font-weight: 700; font-size: 13px; }
        .slip .item { margin: 1.2mm 0; }
        .slip .item .name { font-weight: 600; }
        .slip .banner { text-align: center; font-weight: 700; border: 2px solid #000; margin: 1mm 0; padding: 0.5mm; }
        .no-print { margin: 12px auto; width: ${content}mm; display: flex; gap: 8px; }
        @media print { .no-print { display: none !important; } }
      `}</style>
      <div className="no-print">
        <PrintButton />
      </div>
      <main className="slip">
        <h1>{s?.businessNameMl || s?.businessName || "Sree Krishna Motors"}</h1>
        {s?.businessNameMl && <div className="center">{s.businessName}</div>}
        {(s?.addressMl || s?.address) && <div className="center muted">{s?.addressMl || s?.address}</div>}
        {s?.addressMl && s?.address && <div className="center muted">{s.address}</div>}
        {s?.phones && <div className="center muted">{s.phones}</div>}
        <hr />
        <div className="doc">
          <L k={title} />
        </div>
        {banner && (
          <div className="banner">
            <L k={banner} />
          </div>
        )}
        {children}
        {(s?.invoiceTermsMl || s?.invoiceTerms) && (
          <>
            <hr />
            {s?.invoiceTermsMl && <div className="muted">{s.invoiceTermsMl}</div>}
            {s?.invoiceTerms && <div className="muted">{s.invoiceTerms}</div>}
          </>
        )}
        <hr />
        <div className="center">
          <L k="thanks" />
        </div>
      </main>
    </>
  );
}
