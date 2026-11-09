import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

/** Shown for any unmatched route. Static bilingual text, like error.tsx. */
export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-5xl font-semibold text-muted-foreground">404</p>
      <h1 className="text-xl font-semibold">പേജ് കണ്ടെത്തിയില്ല / Page not found</h1>
      <p className="max-w-sm text-muted-foreground">
        ഈ പേജ് നിലവിലില്ല അല്ലെങ്കിൽ നീക്കം ചെയ്തു. / This page doesn&apos;t exist or has been moved.
      </p>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        ഹോം / Home
      </Link>
    </main>
  );
}
