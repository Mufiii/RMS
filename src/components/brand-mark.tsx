import { cn } from "@/lib/utils";

/** "Sree Krishna Motors" → "SK"; "Shop Manager" → "SM". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** The shop's monogram: business initials on a blue tile. */
export function BrandMark({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-xl bg-sidebar-primary font-bold tracking-tight text-white shadow-[0_2px_6px_oklch(0.5_0.2_262/0.45)]",
        size === "sm" && "size-8 rounded-lg text-xs",
        size === "md" && "size-10 text-sm",
        size === "lg" && "size-14 text-lg",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
