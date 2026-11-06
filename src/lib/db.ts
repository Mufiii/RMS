import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

export type Db = InstanceType<typeof PrismaClient>;

function createClient(): Db {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// One client per process (survives hot reload in dev).
const globalForDb = globalThis as unknown as { __rmsDb?: Db };

// After `prisma generate` (e.g. a new table) the dev server reloads this module with a
// new PrismaClient class, but the cached instance is from the old class and lacks the
// new models. Only reuse the cache if it was built by the current class.
const cached = globalForDb.__rmsDb;
const reusable = cached instanceof PrismaClient ? cached : undefined;
if (cached && !reusable) void cached.$disconnect().catch(() => {});

export const db: Db = reusable ?? createClient();
if (process.env.NODE_ENV !== "production") globalForDb.__rmsDb = db;
