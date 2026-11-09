"use client";

import { useEffect } from "react";
import { buttonVariants } from "@/components/ui/button";

/**
 * Catches an error thrown by any page or layout under the root layout (both
 * the (app) and (auth) route groups), so a database hiccup or a bug shows a
 * plain bilingual message instead of Next's default English error page.
 * Static text, not next-intl: this boundary must not depend on anything
 * that may itself be part of what broke.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-5xl font-semibold text-muted-foreground">!</p>
      <h1 className="text-xl font-semibold">എന്തോ തകരാറ് സംഭവിച്ചു / Something went wrong</h1>
      <p className="max-w-sm text-muted-foreground">
        ദയവായി വീണ്ടും ശ്രമിക്കുക, അല്ലെങ്കിൽ പിന്നീട് വരൂ. / Please try again, or come back later.
      </p>
      <button type="button" onClick={() => reset()} className={buttonVariants({ variant: "outline" })}>
        വീണ്ടും ശ്രമിക്കുക / Try again
      </button>
    </main>
  );
}
