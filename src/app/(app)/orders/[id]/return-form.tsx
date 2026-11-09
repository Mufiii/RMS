"use client";

import { type ComponentProps, useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, FormMessage, SelectField, SubmitButton } from "@/components/form";
import { initialFormState } from "@/lib/form-state";
import { cn } from "@/lib/utils";
import { recordReturnAction, voidReturnAction } from "@/modules/returns/actions";

export type ReturnableLine = {
  id: number;
  label: string;
  serial: string | null;
  outstanding: number;
  issuedOn: string; // DD-MM-YYYY
};

type Entry = {
  good: string;
  damaged: string;
  lost: string;
  damagedAmount: string;
  damagedNote: string;
  lostAmount: string;
  lostNote: string;
};
const EMPTY: Entry = { good: "", damaged: "", lost: "", damagedAmount: "", damagedNote: "", lostAmount: "", lostNote: "" };
const n = (s: string) => Math.max(0, Number.parseInt(s, 10) || 0);

function NumberBox({ label, value, max, onChange }: { label: string; value: string; max: number; onChange: (v: string) => void }) {
  return (
    <label className="grid gap-1 text-xs text-muted-foreground">
      {label}
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-20 text-base text-foreground"
        aria-label={label}
      />
    </label>
  );
}

function LabeledInput({ label, aria, ...props }: { label: string; aria: string } & ComponentProps<typeof Input>) {
  return (
    <label className="grid gap-1 text-xs text-muted-foreground">
      {label}
      <Input aria-label={aria} className="h-10 text-base text-foreground" {...props} />
    </label>
  );
}

export function ReturnForm({
  orderId,
  lines,
  canBackdate,
  today,
}: {
  orderId: number;
  lines: ReturnableLine[];
  canBackdate: boolean;
  today: string;
}) {
  const t = useTranslations("returns");
  const [state, action] = useActionState(recordReturnAction, initialFormState);
  const [entries, setEntries] = useState<Record<number, Entry>>({});
  // After a successful return the page re-renders with new lines; start clean.
  const [seenNonce, setSeenNonce] = useState(state.nonce);
  if (state.nonce !== seenNonce) {
    setSeenNonce(state.nonce);
    setEntries({});
  }

  const get = (id: number) => entries[id] ?? EMPTY;
  const set = (id: number, patch: Partial<Entry>) => setEntries((e) => ({ ...e, [id]: { ...get(id), ...patch } }));

  const payload = lines
    .map((l) => ({ l, e: get(l.id) }))
    .filter(({ e }) => n(e.good) + n(e.damaged) + n(e.lost) > 0)
    .map(({ l, e }) => ({
      issueLineId: l.id,
      good: n(e.good),
      damaged: n(e.damaged),
      lost: n(e.lost),
      damagedAmount: e.damagedAmount.trim(),
      damagedNote: e.damagedNote.trim(),
      lostAmount: e.lostAmount.trim(),
      lostNote: e.lostNote.trim(),
    }));

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form key={state.nonce ?? "form"} action={action} className="grid gap-4">
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="entries" value={JSON.stringify(payload)} />
          <FormMessage message={state.message} ok={state.ok} />

          <Button
            type="button"
            variant="outline"
            className="justify-self-start"
            onClick={() => setEntries(Object.fromEntries(lines.map((l) => [l.id, { ...EMPTY, good: String(l.outstanding) }])))}
          >
            <CheckCheck />
            {t("returnAllGood")}
          </Button>

          <ul className="grid gap-3" data-testid="return-lines">
            {lines.map((l) => {
              const e = get(l.id);
              const total = n(e.good) + n(e.damaged) + n(e.lost);
              const over = total > l.outstanding;
              return (
                <li key={l.id} className={cn("grid gap-3 rounded-lg border p-3", total > 0 && "border-primary/50", over && "border-destructive")}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{l.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {t("outN", { count: l.outstanding })} · {t("issuedOn", { date: l.issuedOn })}
                    </span>
                  </div>

                  {l.serial ? (
                    <div role="radiogroup" aria-label={l.label} className="flex flex-wrap gap-2">
                      {(["none", "good", "damaged", "lost"] as const).map((c) => {
                        const current = n(e.good) ? "good" : n(e.damaged) ? "damaged" : n(e.lost) ? "lost" : "none";
                        return (
                          <label
                            key={c}
                            className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm", current === c && "border-primary bg-primary/5")}
                          >
                            <input
                              type="radio"
                              name={`unit-${l.id}`}
                              className="size-4"
                              checked={current === c}
                              onChange={() => set(l.id, { good: c === "good" ? "1" : "", damaged: c === "damaged" ? "1" : "", lost: c === "lost" ? "1" : "" })}
                            />
                            {c === "none" ? t("notReturned") : t(c)}
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-3">
                      <NumberBox label={t("good")} value={e.good} max={l.outstanding} onChange={(v) => set(l.id, { good: v })} />
                      <NumberBox label={t("damaged")} value={e.damaged} max={l.outstanding} onChange={(v) => set(l.id, { damaged: v })} />
                      <NumberBox label={t("lost")} value={e.lost} max={l.outstanding} onChange={(v) => set(l.id, { lost: v })} />
                    </div>
                  )}

                  {n(e.damaged) > 0 && (
                    <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
                      <LabeledInput
                        label={t("damageCharge")}
                        aria={`${t("damageCharge")} — ${l.label}`}
                        inputMode="decimal"
                        value={e.damagedAmount}
                        onChange={(ev) => set(l.id, { damagedAmount: ev.target.value })}
                      />
                      <LabeledInput
                        label={t("damageNote")}
                        aria={`${t("damageNote")} — ${l.label}`}
                        required
                        value={e.damagedNote}
                        onChange={(ev) => set(l.id, { damagedNote: ev.target.value })}
                      />
                    </div>
                  )}
                  {n(e.lost) > 0 && (
                    <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
                      <LabeledInput
                        label={t("lostCharge")}
                        aria={`${t("lostCharge")} — ${l.label}`}
                        inputMode="decimal"
                        value={e.lostAmount}
                        onChange={(ev) => set(l.id, { lostAmount: ev.target.value })}
                      />
                      <LabeledInput
                        label={t("lostNote")}
                        aria={`${t("lostNote")} — ${l.label}`}
                        required
                        value={e.lostNote}
                        onChange={(ev) => set(l.id, { lostNote: ev.target.value })}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("notes")} name="notes" maxLength={500} defaultValue={state.values?.notes} error={state.fieldErrors?.notes} />
            {canBackdate && (
              <Field
                label={t("date")}
                name="date"
                type="date"
                max={today}
                defaultValue={state.values?.date ?? today}
                error={state.fieldErrors?.date}
              />
            )}
          </div>
          {state.fieldErrors?.entries && <p className="text-sm text-destructive">{state.fieldErrors.entries}</p>}
          <SubmitButton className="justify-self-start" disabled={payload.length === 0}>
            {t("submit")}
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

export function VoidReturnForm({ orderId, returns }: { orderId: number; returns: { id: number; label: string }[] }) {
  const t = useTranslations("returns");
  const [state, action] = useActionState(voidReturnAction, initialFormState);
  if (returns.length === 0 && !state.message) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("voidTitle")}</CardTitle>
        <CardDescription>{t("voidHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form key={state.nonce ?? "form"} action={action} className="grid gap-4">
          <input type="hidden" name="orderId" value={orderId} />
          <FormMessage message={state.message} ok={state.ok} />
          {returns.length > 0 && (
            <>
              <SelectField label={t("chooseReturn")} name="returnId" options={returns.map((r) => ({ value: String(r.id), label: r.label }))} />
              <Field label={t("reason")} name="reason" required minLength={3} maxLength={500} error={state.fieldErrors?.reason} />
              <SubmitButton variant="destructive" className="justify-self-start">
                {t("void")}
              </SubmitButton>
            </>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
