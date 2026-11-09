import { z } from "zod";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/modules/auth/constants";

// Messages are translation keys under `validation.*`.
const username = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "validation.usernameLength")
  .max(32, "validation.usernameLength")
  .regex(/^[a-z0-9._-]+$/, "validation.usernameChars");

const fullName = z.string().trim().min(1, "validation.required").max(100, "validation.tooLong");
const role = z.enum(["ADMIN", "STAFF"], { error: "validation.required" });
const password = z.string().min(PASSWORD_MIN_LENGTH, "validation.passwordLength").max(PASSWORD_MAX_LENGTH, "validation.tooLong");

export const createUserSchema = z.object({ username, fullName, role, password });
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({ fullName, role });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const resetPasswordSchema = z.object({ password });

export const reasonSchema = z.object({
  reason: z.string().trim().min(3, "validation.reasonRequired").max(500, "validation.tooLong"),
});
