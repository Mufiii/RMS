import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";

export type Tx = Prisma.TransactionClient;

/**
 * Runs `fn` in one PostgreSQL transaction (READ COMMITTED + explicit row locks,
 * see docs/02-architecture.md §6). Every stock or money change and its audit
 * row go through here.
 */
export function withTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(fn, { maxWait: 5_000, timeout: 15_000 });
}
