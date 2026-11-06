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

    // Sample catalogue, created through the real services so stock and ledger agree.
    if ((await db.product.count()) === 0) {
      const { createCategory, createProduct } = await import("../src/modules/products/service");
      const { newProductSchema } = await import("../src/modules/inventory/schema");
      const admin = await db.user.findFirstOrThrow({ where: { role: "ADMIN" }, orderBy: { id: "asc" } });
      const actor = { id: admin.id };
      const gen = await createCategory(actor, { name: "Generators", nameMl: "ജനറേറ്ററുകൾ" });
      const scaf = await createCategory(actor, { name: "Scaffolding", nameMl: "സ്കാഫോൾഡിംഗ്" });
      const tools = await createCategory(actor, { name: "Concrete tools", nameMl: "കോൺക്രീറ്റ് ഉപകരണങ്ങൾ" });
      const add = (o: Record<string, string | number>) => createProduct(actor, newProductSchema.parse(o));
      await add({ categoryId: gen.id, code: "GEN-5KVA", name: "Generator 5 kVA", nameMl: "ജനറേറ്റർ 5 kVA", tracking: "SERIALISED", dailyRate: "1500", serials: "G5-001\nG5-002\nG5-003" });
      await add({ categoryId: tools.id, code: "BRK-HD", name: "Breaker (heavy)", nameMl: "ബ്രേക്കർ", tracking: "SERIALISED", dailyRate: "900", serials: "BRK-01\nBRK-02" });
      await add({ categoryId: tools.id, code: "MIX-1B", name: "Concrete mixer (1 bag)", nameMl: "കോൺക്രീറ്റ് മിക്സർ", tracking: "SERIALISED", dailyRate: "1200", serials: "MX-01" });
      await add({ categoryId: scaf.id, code: "PROP-3M", name: "Steel prop 3 m", nameMl: "സ്റ്റീൽ പ്രോപ്പ് 3 മീ", tracking: "QUANTITY", dailyRate: "8", openingQty: 200 });
      await add({ categoryId: scaf.id, code: "CLAMP", name: "Coupler clamp", nameMl: "ക്ലാമ്പ്", tracking: "QUANTITY", dailyRate: "3", openingQty: 500 });
      await add({ categoryId: scaf.id, code: "PLATE", name: "Centering plate", nameMl: "സെന്ററിംഗ് പ്ലേറ്റ്", tracking: "QUANTITY", dailyRate: "6.50", openingQty: 300 });
      console.log("✔ dev sample categories and products");
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
