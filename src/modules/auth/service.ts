import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { withTx } from "@/lib/tx";
import { burnPasswordCheck, hashPassword, verifyPassword } from "./password";
import { clearFailures, isLocked, recordFailure } from "./rate-limit";
import type { SessionClaims } from "./token";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./constants";

export type AuthenticatedUser = {
  id: number;
  username: string;
  fullName: string;
  role: "ADMIN" | "STAFF";
  locale: "en" | "ml";
  mustChangePassword: boolean;
};

const PUBLIC_FIELDS = {
  id: true,
  username: true,
  fullName: true,
  role: true,
  locale: true,
  mustChangePassword: true,
} as const;

/** Audits a login outcome outside the main transaction (a failed attempt may have no user row to lock). */
async function auditLogin(action: "LOGIN_FAILED", userId: number | null, username: string): Promise<void> {
  await withTx((tx) =>
    writeAudit(tx, { actorId: userId, action, entity: "user", entityId: userId, summary: userId === null ? { username } : undefined }),
  );
}

/**
 * Checks credentials. Throws DomainError("auth.invalid") for any bad
 * username/password/inactive account (deliberately indistinguishable) and
 * DomainError("auth.locked") when throttled.
 *
 * `ip` is `null` unless the deployment is configured to trust its reverse
 * proxy's forwarded-for header (`TRUST_PROXY_HEADERS=true`); otherwise a
 * client could set that header itself and dodge the per-IP lock, so only
 * the per-username lock (not spoofable) is used.
 */
export async function login(
  usernameRaw: string,
  password: string,
  ip: string | null,
): Promise<{ user: AuthenticatedUser; claims: SessionClaims }> {
  const username = usernameRaw.trim().toLowerCase();
  const keys = [`u:${username}`, ...(ip ? [`ip:${ip}`] : [])];
  if (isLocked(keys)) throw new DomainError("auth.locked");
  // Reserved before the lookup/compare below, so parallel attempts can't all
  // pass the check before any one of them is counted (cleared again on success).
  recordFailure(keys);

  const row = await db.user.findUnique({ where: { username } });
  if (!row) {
    await burnPasswordCheck(password);
    await auditLogin("LOGIN_FAILED", null, username);
    throw new DomainError("auth.invalid");
  }
  const ok = await verifyPassword(password, row.passwordHash);
  if (!ok || !row.isActive) {
    await auditLogin("LOGIN_FAILED", row.id, username);
    throw new DomainError("auth.invalid");
  }

  clearFailures(keys);
  const user = await withTx(async (tx) => {
    await tx.user.update({ where: { id: row.id }, data: { lastLoginAt: new Date() } });
    await writeAudit(tx, { actorId: row.id, action: "LOGIN", entity: "user", entityId: row.id });
    return tx.user.findUniqueOrThrow({ where: { id: row.id }, select: PUBLIC_FIELDS });
  });
  return { user, claims: { uid: row.id, sv: row.sessionVersion } };
}

/** Resolves a verified session token to a live user, or null if it is no longer valid. */
export async function userForSession(claims: SessionClaims): Promise<AuthenticatedUser | null> {
  const row = await db.user.findUnique({
    where: { id: claims.uid },
    select: { ...PUBLIC_FIELDS, isActive: true, sessionVersion: true },
  });
  if (!row || !row.isActive || row.sessionVersion !== claims.sv) return null;
  const { isActive: _a, sessionVersion: _s, ...user } = row;
  return user;
}

export { PASSWORD_MIN_LENGTH };

/**
 * The user changes their own password (required on first login). Bumps the
 * session version, so every other session of this user ends; returns the
 * new claims for the current session.
 */
export async function changeOwnPassword(
  userId: number,
  currentPassword: string,
  newPassword: string,
): Promise<SessionClaims> {
  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    throw new DomainError("auth.passwordTooShort", { min: PASSWORD_MIN_LENGTH });
  }
  if (newPassword.length > PASSWORD_MAX_LENGTH) {
    throw new DomainError("auth.passwordTooLong", { max: PASSWORD_MAX_LENGTH });
  }
  return withTx(async (tx) => {
    const row = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await verifyPassword(currentPassword, row.passwordHash))) {
      throw new DomainError("auth.currentPasswordWrong");
    }
    if (await verifyPassword(newPassword, row.passwordHash)) {
      throw new DomainError("auth.passwordUnchanged");
    }
    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        passwordHash: await hashPassword(newPassword),
        mustChangePassword: false,
        sessionVersion: { increment: 1 },
      },
    });
    await writeAudit(tx, {
      actorId: userId,
      action: "PASSWORD_CHANGE",
      entity: "user",
      entityId: userId,
    });
    return { uid: userId, sv: updated.sessionVersion };
  });
}

export async function setOwnLocale(userId: number, locale: "en" | "ml"): Promise<void> {
  await db.user.update({ where: { id: userId }, data: { locale } });
}

/**
 * Ends every session of this user by bumping their session version, so a
 * copied token can't keep working after logout. This also signs the user
 * out on any other device they are logged into; there is no per-device
 * session store, so that trade-off is accepted rather than adding one.
 */
export async function endSession(userId: number): Promise<void> {
  await withTx(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
    await writeAudit(tx, { actorId: userId, action: "LOGOUT", entity: "user", entityId: userId });
  });
}
