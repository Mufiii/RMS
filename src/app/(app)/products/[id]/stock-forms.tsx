"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormMessage, SelectField, SubmitButton } from "@/components/form";
import { initialFormState } from "@/lib/form-state";
import { MANUAL_MOVEMENTS, REASON_REQUIRED, UNIT_TRANSITIONS, type UnitAction } from "@/modules/inventory/client-safe";
import { addUnitsAction, adjustQuantityAction, unitActionAction } from "@/modules/inventory/actions";
import { toggleProductAction } from "@/modules/products/actions";

/** Quantity products: one form for every manual movement. */
export function AdjustQuantityForm({ productId }: { productId: number }) {
  const t = useTranslations("stock");
  const [state, action] = useActionState(adjustQuantityAction, initialFormState);
  const [type, setType] = useState<string>("PURCHASE");
  const needsReason = (REASON_REQUIRED as readonly string[]).includes(type);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("adjustTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form key={state.nonce ?? "form"} action={action} className="grid gap-4">
          <input type="hidden" name="productId" value={productId} />
          <FormMessage message={state.message} ok={state.ok} />
          <SelectField
            label={t("type")}
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            options={MANUAL_MOVEMENTS.map((m) => ({ value: m, label: t(`move.${m}`) }))}
          />
          {type === "CORRECTION" && (
            <SelectField
              label={t("direction")}
              name="direction"
              defaultValue="decrease"
              options={[
                { value: "decrease", label: t("decrease") },
                { value: "increase", label: t("increase") },
              ]}
            />
          )}
          <Field
            label={t("quantity")}
            name="quantity"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            required
            error={state.fieldErrors?.quantity}
          />
          <Field
            label={t("reason")}
            name="reason"
            required={needsReason}
            maxLength={500}
            hint={t("reasonHint")}
            error={state.fieldErrors?.reason}
          />
          <SubmitButton className="justify-self-start">{t("save")}</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

/** Serialised products: add units by serial number. */
export function AddUnitsForm({ productId }: { productId: number }) {
  const t = useTranslations();
  const [state, action] = useActionState(addUnitsAction, initialFormState);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("stock.addUnitsTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form key={state.nonce ?? "form"} action={action} className="grid gap-4">
          <input type="hidden" name="productId" value={productId} />
          <FormMessage message={state.message} ok={state.ok} />
          <SelectField
            label={t("stock.addType")}
            name="type"
            defaultValue="PURCHASE"
            options={[
              { value: "PURCHASE", label: t("stock.move.PURCHASE") },
              { value: "OPENING", label: t("stock.move.OPENING") },
            ]}
          />
          <div className="grid gap-1.5">
            <Label htmlFor="f-serials">{t("products.serials")}</Label>
            <Textarea
              id="f-serials"
              name="serials"
              rows={3}
              defaultValue={state.ok ? "" : state.values?.serials}
              aria-invalid={state.fieldErrors?.serials ? true : undefined}
            />
            {state.fieldErrors?.serials ? (
              <p className="text-sm text-destructive">{state.fieldErrors.serials}</p>
            ) : (
              <p className="text-xs text-muted-foreground">{t("products.serialsHint")}</p>
            )}
          </div>
          <SubmitButton className="justify-self-start">{t("stock.addUnits")}</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

type UnitOption = { id: number; serialNo: string; status: string };

/** Serialised products: repair / write-off actions on one unit. */
export function UnitActionForm({ units }: { units: UnitOption[] }) {
  const t = useTranslations();
  const [state, action] = useActionState(unitActionAction, initialFormState);
  const actionable = units.filter((u) => u.status === "AVAILABLE" || u.status === "UNDER_REPAIR");
  const [picked, setUnitId] = useState<string>("");
  // After an action the chosen unit may no longer be actionable; fall back to the first that is.
  const unit = actionable.find((u) => String(u.id) === picked) ?? actionable[0];
  const unitId = unit ? String(unit.id) : "";
  const choices = (Object.keys(UNIT_TRANSITIONS) as UnitAction[]).filter((a) => UNIT_TRANSITIONS[a].from === unit?.status);
  const [act, setAct] = useState<string>("");
  const current = choices.includes(act as UnitAction) ? act : (choices[0] ?? "");
  const needsReason = (REASON_REQUIRED as readonly string[]).includes(current);
  if (actionable.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("stock.unitActionTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form key={state.nonce ?? "form"} action={action} className="grid gap-4">
          <FormMessage message={state.message} ok={state.ok} />
          <SelectField
            label={t("stock.chooseUnit")}
            name="unitId"
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            options={actionable.map((u) => ({
              value: String(u.id),
              label: `${u.serialNo} — ${t(`products.unitStatus.${u.status}` as "products.unitStatus.AVAILABLE")}`,
            }))}
          />
          <SelectField
            label={t("stock.action")}
            name="action"
            value={current}
            onChange={(e) => setAct(e.target.value)}
            options={choices.map((a) => ({ value: a, label: t(`stock.unitActions.${a}`) }))}
          />
          <Field
            label={t("stock.reason")}
            name="reason"
            required={needsReason}
            maxLength={500}
            hint={t("stock.reasonHint")}
            error={state.fieldErrors?.reason}
          />
          <SubmitButton className="justify-self-start">{t("stock.save")}</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

export function ToggleProductForm({ productId, isActive }: { productId: number; isActive: boolean }) {
  const t = useTranslations("products");
  const [state, action] = useActionState(toggleProductAction, initialFormState);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{isActive ? t("deactivate") : t("reactivate")}</CardTitle>
        <CardDescription>{isActive ? t("deactivateHint") : t("reactivateHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="id" value={productId} />
          <input type="hidden" name="active" value={isActive ? "false" : "true"} />
          <FormMessage message={state.message} ok={state.ok} />
          <Field label={t("reasonOptional")} name="reason" maxLength={500} error={state.fieldErrors?.reason} />
          <SubmitButton variant={isActive ? "destructive" : "outline"} className="justify-self-start">
            {isActive ? t("deactivate") : t("reactivate")}
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
