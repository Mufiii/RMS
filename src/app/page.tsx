import { redirect } from "next/navigation";
import { homePath } from "@/lib/permissions";
import { requireUser } from "@/modules/auth/session";

export default async function RootPage() {
  const user = await requireUser();
  redirect(homePath(user.role));
}
