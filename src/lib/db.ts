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

export const db: Db = globalForDb.__rmsDb ?? createClient();
if (process.env.NODE_ENV !== "production") globalForDb.__rmsDb = db;
