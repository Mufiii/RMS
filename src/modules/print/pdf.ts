import "server-only";
import type { Browser } from "playwright";

/**
 * Renders one of our /print pages to a PDF at the roll width
 * (docs/02-architecture.md §8). One headless Chromium is shared by all
 * requests; each PDF gets its own short-lived context carrying the caller's
 * session cookie, so the print page runs its normal permission checks.
 */
let browser: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (browser) {
    const b = await browser.catch(() => null);
    if (b?.isConnected()) return b;
  }
  const { chromium } = await import("playwright");
  browser = chromium.launch({ args: ["--disable-dev-shm-usage"] });
  return browser;
}

export async function renderPdf(url: string, cookie: string, widthMm: number): Promise<Uint8Array> {
  const b = await getBrowser();
  const context = await b.newContext({ extraHTTPHeaders: { cookie }, viewport: { width: 400, height: 800 } });
  try {
    const page = await context.newPage();
    const res = await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    if (!res || !res.ok()) throw new Error(`Print page answered ${res?.status() ?? "nothing"}`);
    if (!page.url().startsWith(url.split("?")[0])) throw new Error("Print page redirected (not signed in?)");
    await page.emulateMedia({ media: "print" });
    await page.evaluate(() => document.fonts.ready);
    // A roll is as long as its content: measure the slip and size the page to it.
    const heightPx = await page.evaluate(() => document.querySelector(".slip")?.getBoundingClientRect().height ?? 1000);
    const heightMm = Math.ceil((heightPx * 25.4) / 96) + 4;
    return await page.pdf({ width: `${widthMm}mm`, height: `${heightMm}mm`, printBackground: true, pageRanges: "1" });
  } finally {
    await context.close();
  }
}
