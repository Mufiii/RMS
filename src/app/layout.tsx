import type { Metadata, Viewport } from "next";
import type { CSSProperties } from "react";
import { Inter, Noto_Sans_Malayalam } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// next/font downloads these at build time and serves them from the app itself,
// so they work offline on the shop LAN (docs/02-architecture.md §2).
const inter = Inter({ subsets: ["latin"], display: "swap" });
const notoMl = Noto_Sans_Malayalam({ subsets: ["malayalam"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Sree Krishna Motors", template: "%s · Sree Krishna Motors" },
  description: "Rental management",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const fontStack = { "--font-sans": `${inter.style.fontFamily}, ${notoMl.style.fontFamily}, sans-serif` } as CSSProperties;
  return (
    <html lang={locale} style={fontStack} className="h-full antialiased">
      <body className="min-h-full bg-background text-foreground">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
