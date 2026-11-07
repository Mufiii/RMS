"use client";

import { Bar, BarChart, CartesianGrid, Cell, Label, Pie, PieChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatINR } from "@/lib/money";

export type Slice = { key: string; label: string; value: number; color: string };

/** Pieces owned by state, total in the hole. Zero slices are kept out of the ring but stay in the legend. */
export function StockDonut({ slices, total, totalLabel }: { slices: Slice[]; total: number; totalLabel: string }) {
  const config = Object.fromEntries(slices.map((s) => [s.key, { label: s.label, color: s.color }])) satisfies ChartConfig;
  const data = slices.filter((s) => s.value > 0);
  return (
    <ChartContainer config={config} className="aspect-square h-44 w-44 shrink-0">
      <PieChart>
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel nameKey="key" />} />
        <Pie data={data.length ? data : [{ key: "none", value: 1 }]} dataKey="value" nameKey="key" innerRadius={62} outerRadius={84} strokeWidth={2} isAnimationActive={false}>
          {data.length ? data.map((s) => <Cell key={s.key} fill={s.color} />) : <Cell fill="var(--muted)" />}
          <Label
            content={({ viewBox }) =>
              viewBox && "cx" in viewBox ? (
                <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                  <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) - 6} className="fill-foreground text-2xl font-semibold">
                    {total}
                  </tspan>
                  <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 16} className="fill-muted-foreground text-[11px]">
                    {totalLabel}
                  </tspan>
                </text>
              ) : null
            }
          />
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}

/** ₹ in Indian short form for axis ticks: 150000 paise → "₹1.5K", 1,20,00,000 paise → "₹1.2L". */
function shortINR(paise: number): string {
  const r = paise / 100;
  const a = Math.abs(r);
  const fmt = (n: number, unit: string) => `₹${Number(n.toFixed(1))}${unit}`;
  if (a >= 1e7) return fmt(r / 1e7, "Cr");
  if (a >= 1e5) return fmt(r / 1e5, "L");
  if (a >= 1e3) return fmt(r / 1e3, "K");
  return `₹${Math.round(r)}`;
}

/** Monthly money collected (paise); the current month stands out. */
export function CollectionsBars({ data, seriesLabel }: { data: { month: string; label: string; net: number }[]; seriesLabel: string }) {
  const config = { net: { label: seriesLabel, color: "var(--dash-blue)" } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="h-56 w-full">
      <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={shortINR} />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.6 }}
          content={
            <ChartTooltipContent
              formatter={(value) => (
                <div className="flex w-full items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="size-2.5 rounded-[2px] bg-(--dash-blue)" />
                    {seriesLabel}
                  </span>
                  <span className="font-mono font-medium tabular-nums text-foreground">{formatINR(Number(value))}</span>
                </div>
              )}
            />
          }
        />
        <Bar dataKey="net" radius={[6, 6, 0, 0]} maxBarSize={48} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={d.month} fill={d.net < 0 ? "var(--dash-amber)" : "var(--dash-blue)"} fillOpacity={i === data.length - 1 ? 1 : 0.55} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
