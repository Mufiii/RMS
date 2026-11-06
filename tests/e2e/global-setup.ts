import { execSync } from "node:child_process";

/** Fresh test database with one admin who must change their password. */
export default function globalSetup() {
  const url = process.env.TEST_DATABASE_URL!;
  if (!/_test\b/.test(url)) throw new Error("TEST_DATABASE_URL must point at a *_test database");
  const env = { ...process.env, DATABASE_URL: url };
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" });
  execSync("npx tsx tests/e2e/seed-e2e.ts", { env, stdio: "inherit" });
}
