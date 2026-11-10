"use client";

import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Re-runs the server page so the figures are current; no client-side data. */
export function RefreshButton({ label }: { label: string }) {
  const router = useRouter();
  return (
    <Button variant="outline" size="sm" onClick={() => router.refresh()}>
      <RefreshCw className="size-4" />
      {label}
    </Button>
  );
}
