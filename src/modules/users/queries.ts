import "server-only";
import { db } from "@/lib/db";

export function listUsers() {
  return db.user.findMany({
    orderBy: [{ isActive: "desc" }, { role: "asc" }, { fullName: "asc" }],
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
      isActive: true,
      mustChangePassword: true,
      lastLoginAt: true,
    },
  });
}

export function getUser(id: number) {
  return db.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
      isActive: true,
      mustChangePassword: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
}
