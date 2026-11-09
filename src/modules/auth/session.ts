import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { can, type Permission } from "@/lib/permissions";
import { ForbiddenError } from "@/lib/errors";
import { type AuthenticatedUser, userForSession } from "./service";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession, verifySession, type SessionClaims } from "./token";

export const LOCALE_COOKIE = "rms_locale";

export async function setSessionCookie(claims: SessionClaims): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await signSession(claims), {
    httpOnly: true,
    sameSite: "lax",
    // Plain HTTP is used on the shop LAN; HTTPS on the VPS (docs/04-deployment.md).
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function setLocaleCookie(locale: "en" | "ml"): Promise<void> {
  (await cookies()).set(LOCALE_COOKIE, locale, {
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });
}

/**
 * Data access layer entry point: the logged-in user, re-validated against the
 * database on every request (active flag, role, session version). Memoised
 * per request.
 */
export const getCurrentUser = cache(async (): Promise<AuthenticatedUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const claims = await verifySession(token);
  if (!claims) return null;
  return userForSession(claims);
});

/** For pages: redirects to login if signed out, or to change-password if required. */
export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  return user;
}

/** For pages: as requireUser, plus the permission check (403 page if missing). */
export async function requirePagePermission(permission: Permission): Promise<AuthenticatedUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) redirect("/forbidden");
  return user;
}

/** For server actions: never trusts the UI. Throws instead of redirecting. */
export async function requireActionPermission(permission: Permission): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword || !can(user.role, permission)) {
    throw new ForbiddenError();
  }
  return user;
}

/**
 * The caller's IP for login throttling, or null when it can't be trusted.
 * `x-forwarded-for` is only read when `TRUST_PROXY_HEADERS=true` (the VPS
 * option behind Caddy, which overwrites it) — on a direct connection (shop
 * PC) a client can set that header itself, which would let it dodge the
 * per-IP lock, so it is ignored there and only the per-username lock applies.
 */
export async function clientIp(): Promise<string | null> {
  if (process.env.TRUST_PROXY_HEADERS !== "true") return null;
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}
