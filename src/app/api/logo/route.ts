import { db } from "@/lib/db";
import { getCurrentUser } from "@/modules/auth/session";

/** GET /api/logo → the business logo (for print slips and Settings). Signed-in users only. */
export async function GET() {
  if (!(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });
  const s = await db.settings.findUnique({ where: { id: 1 }, select: { logoData: true, logoMime: true } });
  if (!s?.logoData || !s.logoMime) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(s.logoData), {
    headers: {
      "Content-Type": s.logoMime,
      // Links carry ?v=<updated time>, so a new logo is a new URL and the old one can be cached.
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
