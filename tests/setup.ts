import { afterAll } from "vitest";
import { db } from "@/lib/db";

afterAll(async () => {
  await db.$disconnect();
});
