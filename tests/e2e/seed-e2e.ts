import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await db.settings.create({ data: { id: 1, businessName: "Sree Krishna Motors" } });
  await db.user.create({
    data: {
      username: "admin",
      fullName: "Shop Owner",
      role: "ADMIN",
      passwordHash: await bcrypt.hash("admin-initial", 4),
      mustChangePassword: true,
    },
  });
  // Counter staff for module specs (no forced password change).
  await db.user.create({
    data: {
      username: "counter",
      fullName: "Counter Staff",
      role: "STAFF",
      passwordHash: await bcrypt.hash("counter-pass", 4),
      mustChangePassword: false,
    },
  });
}

main().finally(() => db.$disconnect());
