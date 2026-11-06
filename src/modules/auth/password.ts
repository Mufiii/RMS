import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const COST = process.env.NODE_ENV === "test" ? 4 : 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// When the username does not exist we still run one bcrypt comparison at the
// same cost, so response time doesn't reveal which usernames are valid.
let dummyHash: Promise<string> | undefined;
export async function burnPasswordCheck(plain: string): Promise<void> {
  dummyHash ??= bcrypt.hash(randomBytes(16).toString("hex"), COST);
  await bcrypt.compare(plain, await dummyHash);
}
