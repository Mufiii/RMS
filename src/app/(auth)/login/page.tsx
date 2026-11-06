import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { homePath } from "@/lib/permissions";
import { getCurrentUser } from "@/modules/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.mustChangePassword ? "/change-password" : homePath(user.role));
  return <LoginForm />;
}
