import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

export const LOCALES = ["en", "ml"] as const;
export type AppLocale = (typeof LOCALES)[number];

/**
 * No locale URL prefixes (docs/02-architecture.md §9): the locale comes from
 * the user's saved preference, mirrored in the `rms_locale` cookie at login
 * and when switched from the header.
 */
export default getRequestConfig(async () => {
  const value = (await cookies()).get("rms_locale")?.value;
  const locale: AppLocale = value === "ml" ? "ml" : "en";
  return {
    locale,
    timeZone: "Asia/Kolkata",
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
