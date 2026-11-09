"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * Catches an error in the root layout itself (very rare — error.tsx handles
 * everything below it). This replaces the root layout entirely, so it ships
 * its own <html>/<body> and keeps its dependencies minimal on purpose: it
 * must still render even if other app machinery just failed.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang="en">
      <body className="min-h-full bg-background text-foreground">
        <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center">
          <p className="text-5xl font-semibold text-muted-foreground">!</p>
          <h1 className="text-xl font-semibold">എന്തോ തകരാറ് സംഭവിച്ചു / Something went wrong</h1>
          <p className="max-w-sm text-muted-foreground">ദയവായി വീണ്ടും ശ്രമിക്കുക. / Please try again.</p>
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-lg border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            വീണ്ടും ശ്രമിക്കുക / Try again
          </button>
        </main>
      </body>
    </html>
  );
}
