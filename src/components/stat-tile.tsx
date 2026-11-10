import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Accent colours for tiles and pills (CSS variables in globals.css). */
export type Tone = "blue" | "green" | "red" | "amber" | "violet" | "muted";

/** Literal class names per accent so Tailwind sees them. */
const TONE: Record<Tone, { icon: string; pill: string }> = {
  blue: { icon: "bg-(--dash-blue)/10 text-(--dash-blue)", pill: "bg-(--dash-blue)/10 text-(--dash-blue) ring-(--dash-blue)/20" },
  green: { icon: "bg-(--dash-green)/10 text-(--dash-green)", pill: "bg-(--dash-green)/10 text-(--dash-green) ring-(--dash-green)/20" },
  red: { icon: "bg-(--dash-red)/10 text-(--dash-red)", pill: "bg-(--dash-red)/10 text-(--dash-red) ring-(--dash-red)/20" },
  amber: { icon: "bg-(--dash-amber)/12 text-(--dash-amber)", pill: "bg-(--dash-amber)/12 text-(--dash-amber) ring-(--dash-amber)/25" },
  violet: { icon: "bg-(--dash-violet)/10 text-(--dash-violet)", pill: "bg-(--dash-violet)/10 text-(--dash-violet) ring-(--dash-violet)/20" },
  muted: { icon: "bg-muted text-muted-foreground", pill: "bg-muted text-muted-foreground ring-foreground/10" },
};

/** Small coloured status label. Pair the colour with an icon or a word — never colour alone. */
export function Pill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset [&>svg]:size-3.5",
        TONE[tone].pill,
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Summary card: coloured icon, label, value, optional detail line; a link when `href` is given. */
export function StatTile(props: {
  label: string;
  value: string;
  detail?: ReactNode;
  href?: string;
  testId: string;
  tone: Tone;
  icon: ComponentType<{ className?: string }>;
  /** Phones: icon above the text and a smaller value, so tiles fit two per row. */
  compact?: boolean;
}) {
  const Icon = props.icon;
  const c = props.compact;
  const card = (
    <Card
      className={cn(
        "h-full px-5 py-5",
        c && "max-sm:px-4 max-sm:py-4",
        props.href && "transition-[box-shadow,translate] duration-200 group-hover:-translate-y-px group-hover:shadow-md",
      )}
      data-testid={props.href ? undefined : props.testId}
    >
      <div className={cn("flex items-start gap-4", c && "max-sm:flex-col max-sm:gap-3")}>
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", c && "max-sm:size-9", TONE[props.tone].icon)}>
          <Icon className="size-5" />
        </span>
        <span className="grid min-w-0 gap-1">
          <span className="text-sm font-medium text-muted-foreground">{props.label}</span>
          <span className={cn("text-[1.75rem] leading-none font-semibold tracking-tight tabular-nums", c && "max-sm:text-xl")}>{props.value}</span>
          {props.detail && <span className="mt-0.5 text-[13px] text-muted-foreground">{props.detail}</span>}
        </span>
      </div>
    </Card>
  );
  return props.href ? (
    <Link href={props.href} className="group rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" data-testid={props.testId}>
      {card}
    </Link>
  ) : (
    card
  );
}
