import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic check only: no session cookie → login page. The real checks
 * (signature, expiry, active user, permissions) happen on the server in every
 * page and action (docs/02-architecture.md §5).
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has("rms_session")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except the login page, health check, Next internals and static files.
  matcher: ["/((?!login|forbidden|api/health|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico|woff2?)$).*)"],
};
