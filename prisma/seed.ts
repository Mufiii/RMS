/**
 * Seeds the first admin and the settings row (docs/03-database-design.md §4).
 * Idempotent: running it again changes nothing that already exists.
 *
 *   SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD  – required for the first run
 *   SEED_DEV_DATA=true                         – also add a demo staff user (development only)
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  await db.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, businessName: "Sree Krishna Motors", businessNameMl: "ശ്രീ കൃഷ്ണ മോട്ടോഴ്സ്" },
  });
  console.log("✔ settings row");

  const adminCount = await db.user.count({ where: { role: "ADMIN" } });
  if (adminCount === 0) {
    const username = process.env.SEED_ADMIN_USERNAME?.trim().toLowerCase();
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!username || !password || password.length < 8) {
      throw new Error("Set SEED_ADMIN_USERNAME and SEED_ADMIN_PASSWORD (8+ chars) to create the first admin.");
    }
    const admin = await db.user.create({
      data: {
        username,
        fullName: "Administrator",
        role: "ADMIN",
        passwordHash: await bcrypt.hash(password, 12),
        mustChangePassword: true,
      },
    });
    await db.auditLog.create({
      data: { actorId: null, action: "USER_CREATE", entity: "user", entityId: String(admin.id), summary: { username, role: "ADMIN", via: "seed" } },
    });
    console.log(`✔ admin "${username}" created (must change password at first login)`);
  } else {
    console.log("• admin already exists, skipped");
  }

  if (process.env.SEED_DEV_DATA === "true") {
    const exists = await db.user.findUnique({ where: { username: "staff" } });
    if (!exists) {
      await db.user.create({
        data: {
          username: "staff",
          fullName: "Demo Staff",
          role: "STAFF",
          passwordHash: await bcrypt.hash("staff1234", 12),
          mustChangePassword: false,
        },
      });
      console.log('✔ dev staff user "staff" / "staff1234"');
    }
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await db.$disconnect();
    process.exit(1);
  });
