"use client";

import { type ComponentProps, type ReactNode, useId } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Label + input + translated error, wired for server-action forms. */
export function Field({
  label,
  name,
  error,
  hint,
  className,
  ...inputProps
}: { label: string; name: string; error?: string; hint?: ReactNode } & ComponentProps<typeof Input>) {
  // useId: two forms on one page may both have e.g. a "reason" field.
  const id = `f-${name}-${useId()}`;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        className="h-10"
        {...inputProps}
      />
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p id={`${id}-err`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Native <select> styled like the inputs; submits directly via FormData. */
export function SelectField({
  label,
  name,
  error,
  options,
  ...props
}: {
  label: string;
  name: string;
  error?: string;
  options: { value: string; label: string }[];
} & ComponentProps<"select">) {
  // useId: two forms on one page may both have e.g. a "reason" field.
  const id = `f-${name}-${useId()}`;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        className="h-10 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30"
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function SubmitButton({ children, className, disabled, ...props }: ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending || disabled} className={cn("h-10", className)} {...props}>
      {pending ? "…" : children}
    </Button>
  );
}

export function FormMessage({ message, ok }: { message?: string; ok?: boolean }) {
  if (!message) return null;
  return (
    <p
      role={ok ? "status" : "alert"}
      className={cn(
        "rounded-lg px-3 py-2 text-sm",
        ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-destructive/10 text-destructive",
      )}
    >
      {message}
    </p>
  );
}
