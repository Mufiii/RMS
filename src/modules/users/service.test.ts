import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { makeUser, resetDb } from "../../../tests/db";
import { resetRateLimiter } from "@/modules/auth/rate-limit";
import { login, userForSession } from "@/modules/auth/service";
import { createUserSchema } from "./schema";
import { createUser, resetPassword, setUserActive, updateUser } from "./service";

beforeEach(async () => {
  await resetDb();
  resetRateLimiter();
});

const code = (p: Promise<unknown>) => p.then(() => "ok", (e: { code?: string }) => e.code ?? String(e));

describe("createUser", () => {
  it("creates a user who must change their password, with an audit row", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const u = await createUser(admin, { username: "anu", fullName: "Anu", role: "STAFF", password: "temp-pass" });
    expect(u.mustChangePassword).toBe(true);
    const { user } = await login("anu", "temp-pass", "ip");
    expect(user.mustChangePassword).toBe(true);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "USER_CREATE" } });
    expect(audit.actorId).toBe(admin.id);
    expect(audit.entityId).toBe(String(u.id));
  });

  it("rejects a duplicate username", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    await createUser(admin, { username: "anu", fullName: "Anu", role: "STAFF", password: "temp-pass" });
    expect(await code(createUser(admin, { username: "anu", fullName: "Other", role: "STAFF", password: "temp-pass" }))).toBe(
      "users.usernameTaken",
    );
  });

  it("normalises and validates input", () => {
    const ok = createUserSchema.safeParse({ username: " Anu.K ", fullName: " Anu ", role: "STAFF", password: "12345678" });
    expect(ok.success && ok.data.username).toBe("anu.k");
    expect(createUserSchema.safeParse({ username: "a b", fullName: "x", role: "STAFF", password: "12345678" }).success).toBe(false);
    expect(createUserSchema.safeParse({ username: "abc", fullName: "x", role: "OWNER", password: "12345678" }).success).toBe(false);
    expect(createUserSchema.safeParse({ username: "abc", fullName: "x", role: "STAFF", password: "short" }).success).toBe(false);
  });
});

describe("updateUser", () => {
  it("a role change ends the user's sessions and is audited", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const staff = await makeUser({ role: "STAFF" });
    await updateUser(admin, staff.id, { fullName: "Promoted", role: "ADMIN" });
    expect(await userForSession({ uid: staff.id, sv: 1 })).toBeNull();
    expect(await db.auditLog.count({ where: { action: "USER_ROLE_CHANGE" } })).toBe(1);
  });

  it("a name-only change keeps sessions", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const staff = await makeUser({ role: "STAFF" });
    await updateUser(admin, staff.id, { fullName: "Renamed", role: "STAFF" });
    expect(await userForSession({ uid: staff.id, sv: 1 })).not.toBeNull();
  });

  it("an admin cannot demote themselves", async () => {
    const a1 = await makeUser({ role: "ADMIN" });
    await makeUser({ role: "ADMIN" });
    expect(await code(updateUser(a1, a1.id, { fullName: "Me", role: "STAFF" }))).toBe("users.cannotDemoteSelf");
  });

  it("the last active admin cannot be demoted", async () => {
    const a1 = await makeUser({ role: "ADMIN" });
    const a2 = await makeUser({ role: "ADMIN" });
    await setUserActive(a1, a2.id, false, "left the shop");
    // Only a1 is an active admin now, so nobody may demote a1.
    expect(await code(updateUser(a2, a1.id, { fullName: "A1", role: "STAFF" }))).toBe("users.lastAdmin");
    // With a second active admin again, the demotion is allowed.
    await setUserActive(a1, a2.id, true, "came back");
    expect(await code(updateUser(a2, a1.id, { fullName: "A1", role: "STAFF" }))).toBe("ok");
  });
});

describe("resetPassword", () => {
  it("sets a temporary password, forces a change and ends existing sessions", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const staff = await makeUser({ password: "old-pass-1" });
    await resetPassword(admin, staff.id, "temp-pass-2");
    expect(await userForSession({ uid: staff.id, sv: 1 })).toBeNull();
    const { user } = await login(staff.username, "temp-pass-2", "ip");
    expect(user.mustChangePassword).toBe(true);
    expect(await db.auditLog.count({ where: { action: "PASSWORD_RESET" } })).toBe(1);
  });
});

describe("setUserActive", () => {
  it("deactivation blocks login, ends sessions and records the reason", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const staff = await makeUser({ password: "staff-pass" });
    await setUserActive(admin, staff.id, false, "left the job");
    expect(await userForSession({ uid: staff.id, sv: 1 })).toBeNull();
    expect(await code(login(staff.username, "staff-pass", "ip"))).toBe("auth.invalid");
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "USER_DEACTIVATE" } });
    expect(audit.reason).toBe("left the job");

    await setUserActive(admin, staff.id, true, "rehired");
    await expect(login(staff.username, "staff-pass", "ip2")).resolves.toBeTruthy();
  });

  it("an admin cannot deactivate themselves", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    expect(await code(setUserActive(admin, admin.id, false, "test"))).toBe("users.cannotDeactivateSelf");
  });

  it("never leaves the shop without an active admin, even under concurrent deactivation", async () => {
    const a1 = await makeUser({ role: "ADMIN" });
    const a2 = await makeUser({ role: "ADMIN" });
    const results = await Promise.all([
      code(setUserActive(a1, a2.id, false, "race")),
      code(setUserActive(a2, a1.id, false, "race")),
    ]);
    expect(results.sort()).toEqual(["ok", "users.lastAdmin"]);
    expect(await db.user.count({ where: { role: "ADMIN", isActive: true } })).toBe(1);
  });
});
