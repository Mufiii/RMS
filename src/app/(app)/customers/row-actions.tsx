"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Eye, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { FormMessage, SubmitButton } from "@/components/form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type FormState, initialFormState } from "@/lib/form-state";
import { deleteCustomerAction, setCustomerActiveAction } from "@/modules/customers/actions";

type Target = { id: number; name: string; isActive: boolean; hasHistory: boolean };

/** The ⋮ menu on a customer row: view, edit, and (admins) delete with confirmation. */
export function CustomerRowActions({ customer, canDelete }: { customer: Target; canDelete: boolean }) {
  const t = useTranslations("customers");
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label={t("actionsFor", { name: customer.name })} />}
        >
          <MoreVertical />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem render={<Link href={`/customers/${customer.id}`} />}>
            <Eye />
            {t("viewDetails")}
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href={`/customers/${customer.id}/edit`} />}>
            <Pencil />
            {t("edit")}
          </DropdownMenuItem>
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setConfirming(true)}>
                <Trash2 />
                {t("delete")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {canDelete && (
        <Dialog open={confirming} onOpenChange={setConfirming}>
          <DialogContent>
            {/* Mounted only while open, so each opening starts with a clean form state. */}
            {customer.hasHistory ? (
              <CannotDelete customer={customer} onDone={() => setConfirming(false)} />
            ) : (
              <ConfirmDelete customer={customer} onDone={() => setConfirming(false)} />
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/**
 * Runs the server action; on success toasts and closes the dialog straight
 * away. Not done in an effect: a deleted customer's row (and this dialog)
 * unmounts in the same render that delivers the result.
 */
function useDialogAction(serverAction: (prev: FormState, fd: FormData) => Promise<FormState>, onDone: () => void) {
  return useActionState(async (prev: FormState, fd: FormData) => {
    const result = await serverAction(prev, fd);
    if (result.ok) {
      if (result.message) toast.success(result.message);
      onDone();
    }
    return result;
  }, initialFormState);
}

function ConfirmDelete({ customer, onDone }: { customer: Target; onDone: () => void }) {
  const t = useTranslations("customers");
  const [state, action] = useDialogAction(deleteCustomerAction, onDone);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={customer.id} />
      <DialogHeader>
        <DialogTitle>{t("deleteTitle", { name: customer.name })}</DialogTitle>
        <DialogDescription>{t("deleteHint")}</DialogDescription>
      </DialogHeader>
      {!state.ok && <FormMessage message={state.message} ok={false} />}
      <DialogFooter>
        <DialogClose render={<Button variant="outline" size="lg" className="h-10" />}>{t("cancel")}</DialogClose>
        <SubmitButton variant="destructive">{t("deleteConfirm")}</SubmitButton>
      </DialogFooter>
    </form>
  );
}

/** Customers with orders or payments are kept for history; offer to deactivate instead. */
function CannotDelete({ customer, onDone }: { customer: Target; onDone: () => void }) {
  const t = useTranslations("customers");
  const [state, action] = useDialogAction(setCustomerActiveAction, onDone);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={customer.id} />
      <input type="hidden" name="active" value="false" />
      <DialogHeader>
        <DialogTitle>{t("cannotDeleteTitle", { name: customer.name })}</DialogTitle>
        <DialogDescription>{customer.isActive ? t("cannotDeleteHint") : t("cannotDeleteInactive")}</DialogDescription>
      </DialogHeader>
      {!state.ok && <FormMessage message={state.message} ok={false} />}
      <DialogFooter>
        <DialogClose render={<Button variant="outline" size="lg" className="h-10" />}>
          {customer.isActive ? t("cancel") : t("close")}
        </DialogClose>
        {customer.isActive && <SubmitButton variant="destructive">{t("markInactive")}</SubmitButton>}
      </DialogFooter>
    </form>
  );
}
