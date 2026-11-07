import { getTranslations } from "next-intl/server";
import { FileDown, Printer } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export type PrintDoc = "invoice" | "statement" | "receipt";

/** "Print" opens the bare thermal-slip page; "PDF" downloads the same page as a PDF (for WhatsApp etc.). */
export async function PrintLinks({ doc, id, size = "sm" }: { doc: PrintDoc; id: number; size?: "sm" | "default" }) {
  const t = await getTranslations("print");
  return (
    <span className="inline-flex gap-2">
      <a href={`/print/${doc}/${id}`} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline", size })}>
        <Printer />
        {t("print")}
      </a>
      <a href={`/api/pdf/${doc}/${id}`} className={buttonVariants({ variant: "outline", size })}>
        <FileDown />
        {t("pdf")}
      </a>
    </span>
  );
}
