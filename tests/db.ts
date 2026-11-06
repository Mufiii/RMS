import { db } from "@/lib/db";
import { hashPassword } from "@/modules/auth/password";

/** Wipes every business table (TRUNCATE bypasses the audit append-only trigger by design). */
export async function resetDb() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"${t.tablename}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

export async function makeUser(
  overrides: Partial<{ username: string; fullName: string; role: "ADMIN" | "STAFF"; password: string; isActive: boolean; mustChangePassword: boolean }> = {},
) {
  const { password = "password123", ...rest } = overrides;
  return db.user.create({
    data: {
      username: rest.username ?? `user${Math.random().toString(36).slice(2, 8)}`,
      fullName: rest.fullName ?? "Test User",
      role: rest.role ?? "STAFF",
      isActive: rest.isActive ?? true,
      mustChangePassword: rest.mustChangePassword ?? false,
      passwordHash: await hashPassword(password),
    },
  });
}
