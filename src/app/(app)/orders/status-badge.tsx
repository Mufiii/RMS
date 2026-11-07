import { Ban, CircleCheck, CircleDot } from "lucide-react";
import { Pill, type Tone } from "@/components/stat-tile";

const STYLE: Record<string, { tone: Tone; icon: typeof CircleDot }> = {
  OPEN: { tone: "blue", icon: CircleDot },
  CLOSED: { tone: "green", icon: CircleCheck },
  CANCELLED: { tone: "muted", icon: Ban },
};

/** Order status with an icon, so it never relies on colour alone. */
export function OrderStatusBadge({ status, label, className }: { status: string; label: string; className?: string }) {
  const s = STYLE[status] ?? STYLE.CANCELLED!;
  const Icon = s.icon;
  return (
    <Pill tone={s.tone} className={className}>
      <Icon aria-hidden />
      {label}
    </Pill>
  );
}
