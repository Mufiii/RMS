import { execSync } from "node:child_process";

/** Brings the test database schema up to date once per run. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !/rms_test|_test\b/.test(url)) {
    throw new Error("Refusing to run: TEST_DATABASE_URL must point at a *_test database");
  }
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
