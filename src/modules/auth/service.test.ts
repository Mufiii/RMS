import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { makeUser, resetDb } from "../../../tests/db";
import { PASSWORD_MAX_LENGTH } from "./constants";
import { resetRateLimiter } from "./rate-limit";
import { changeOwnPassword, endSession, login, userForSession } from "./service";
import { signSession, verifySession } from "./token";

beforeEach(async () => {
  await resetDb();
  resetRateLimiter();
});

const code = (p: Promise<unknown>) => p.then(() => "ok", (e: { code?: string }) => e.code ?? String(e));

describe("login", () => {
  it("accepts correct credentials, case-insensitive username, and records last login", async () => {
    const u = await makeUser({ username: "ravi", password: "secret123" });
    const { user, claims } = await login("  RAVI ", "secret123", "1.1.1.1");
    expect(user.id).toBe(u.id);
    expect(claims).toEqual({ uid: u.id, sv: 1 });
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).lastLoginAt).not.toBeNull();
  });

  it("gives the same error for wrong password, unknown user and inactive user", async () => {
    await makeUser({ username: "ravi", password: "secret123" });
    await makeUser({ username: "old", password: "secret123", isActive: false });
    expect(await code(login("ravi", "wrong-pass", "ip"))).toBe("auth.invalid");
    expect(await code(login("nobody", "secret123", "ip2"))).toBe("auth.invalid");
    expect(await code(login("old", "secret123", "ip3"))).toBe("auth.invalid");
  });

  it("locks a username after 5 failures, even with the right password", async () => {
    await makeUser({ username: "ravi", password: "secret123" });
    for (let i = 0; i < 5; i++) await code(login("ravi", "bad", `ip${i}`));
    expect(await code(login("ravi", "secret123", "fresh-ip"))).toBe("auth.locked");
  });

  it("locks an IP after 5 failures across usernames", async () => {
    await makeUser({ username: "ravi", password: "secret123" });
    for (let i = 0; i < 5; i++) await code(login(`guess${i}`, "bad", "9.9.9.9"));
    expect(await code(login("ravi", "secret123", "9.9.9.9"))).toBe("auth.locked");
  });

  it("parallel wrong-password attempts can't all slip past the lock", async () => {
    // Each attempt is reserved against the lock before its DB lookup/compare,
    // so only the first 5 of 8 parallel attempts get to try a password at all.
    await makeUser({ username: "ravi", password: "secret123" });
    const results = await Promise.all(Array.from({ length: 8 }, () => code(login("ravi", "bad", "ip"))));
    expect(results.filter((r) => r === "auth.invalid")).toHaveLength(5);
    expect(results.filter((r) => r === "auth.locked")).toHaveLength(3);
  });

  it("ignores a null ip (direct connection, not a trusted reverse proxy) rather than sharing one lock across everyone", async () => {
    await makeUser({ username: "ravi", password: "secret123" });
    await makeUser({ username: "anu", password: "secret123" });
    for (let i = 0; i < 5; i++) await code(login("ravi", "bad", null));
    expect(await code(login("ravi", "secret123", null))).toBe("auth.locked");
    // A different username is unaffected: there is no shared per-IP key to exhaust.
    expect(await code(login("anu", "secret123", null))).toBe("ok");
  });
});

describe("login auditing", () => {
  it("audits a successful login and a failed one, including an unknown username", async () => {
    const u = await makeUser({ username: "ravi", password: "secret123" });
    await login("ravi", "secret123", "ip");
    expect(await db.auditLog.count({ where: { action: "LOGIN", entityId: String(u.id) } })).toBe(1);

    expect(await code(login("ravi", "wrong", "ip2"))).toBe("auth.invalid");
    expect(await db.auditLog.count({ where: { action: "LOGIN_FAILED", entityId: String(u.id) } })).toBe(1);

    expect(await code(login("nobody", "whatever", "ip3"))).toBe("auth.invalid");
    const unknown = await db.auditLog.findFirstOrThrow({ where: { action: "LOGIN_FAILED", entityId: null } });
    expect(unknown.summary).toMatchObject({ username: "nobody" });
  });
});

describe("endSession", () => {
  it("bumps the session version so an existing token stops working, and is audited", async () => {
    const u = await makeUser();
    const claims = { uid: u.id, sv: 1 };
    expect(await userForSession(claims)).not.toBeNull();
    await endSession(u.id);
    expect(await userForSession(claims)).toBeNull();
    expect(await db.auditLog.count({ where: { action: "LOGOUT", entityId: String(u.id) } })).toBe(1);
  });
});

describe("session tokens", () => {
  it("round-trips and rejects tampering", async () => {
    const token = await signSession({ uid: 7, sv: 3 });
    expect(await verifySession(token)).toEqual({ uid: 7, sv: 3 });
    expect(await verifySession(`${token.slice(0, -2)}xx`)).toBeNull();
    expect(await verifySession(undefined)).toBeNull();
  });

  it("is invalid once the user is deactivated or their session version moves on", async () => {
    const u = await makeUser();
    const claims = { uid: u.id, sv: 1 };
    expect(await userForSession(claims)).not.toBeNull();
    await db.user.update({ where: { id: u.id }, data: { sessionVersion: 2 } });
    expect(await userForSession(claims)).toBeNull();
    await db.user.update({ where: { id: u.id }, data: { isActive: false } });
    expect(await userForSession({ uid: u.id, sv: 2 })).toBeNull();
  });
});

describe("changeOwnPassword", () => {
  it("requires the current password, clears the must-change flag and ends other sessions", async () => {
    const u = await makeUser({ password: "first-pass", mustChangePassword: true });
    expect(await code(changeOwnPassword(u.id, "wrong", "second-pass"))).toBe("auth.currentPasswordWrong");
    expect(await code(changeOwnPassword(u.id, "first-pass", "short"))).toBe("auth.passwordTooShort");
    expect(await code(changeOwnPassword(u.id, "first-pass", "first-pass"))).toBe("auth.passwordUnchanged");

    const claims = await changeOwnPassword(u.id, "first-pass", "second-pass");
    expect(claims.sv).toBe(2);
    expect(await userForSession({ uid: u.id, sv: 1 })).toBeNull();
    const after = await userForSession(claims);
    expect(after?.mustChangePassword).toBe(false);
    await expect(login(u.username, "second-pass", "ip")).resolves.toBeTruthy();

    const audit = await db.auditLog.findMany({ where: { action: "PASSWORD_CHANGE" } });
    expect(audit).toHaveLength(1);
  });

  it("rejects a new password longer than bcrypt can use, and the old one still works", async () => {
    const u = await makeUser({ username: "ravi", password: "first-pass" });
    const tooLong = "x".repeat(PASSWORD_MAX_LENGTH + 1);
    expect(await code(changeOwnPassword(u.id, "first-pass", tooLong))).toBe("auth.passwordTooLong");
    await expect(login("ravi", "first-pass", "ip")).resolves.toBeTruthy();
  });
});
