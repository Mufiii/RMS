"use client";

import { type ReactNode, useActionState, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TableCell, TableRow } from "@/components/ui/table";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { initialFormState } from "@/lib/form-state";
import { cancelOrderAction } from "@/modules/orders/actions";

/**
 * A clickable order row: the data cells come from the server as `children`,
 * this just adds row-level navigation plus the ⋮ actions menu. Clicks inside
 * the menu/dialog are stopped before they reach the row (both render through
 * a portal, so in the React tree — not just the DOM — they're descendants of
 * this row and would otherwise bubble into its own click handler).
 */
export function OrderRow({
  href,
  orderId,
  orderNo,
  canCancel,
  shortcuts = [],
  children,
}: {
  href: string;
  orderId: number;
  orderNo: string;
  canCancel: boolean;
  /** Extra menu items worked out on the server (labels already translated): in-app anchors, print slips, tel: links. */
  shortcuts?: { key: string; label: string; href: string; external?: boolean }[];
  children: ReactNode;
}) {
  const router = useRouter();
  const t = useTranslations("orders");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [state, action] = useActionState(cancelOrderAction, initialFormState);

  // No effect needed to close the dialog on success: cancelling flips the order
  // out of OPEN, so `canCancel` goes false on the next render and this whole
  // block (dialog included) stops rendering — mirrors the order detail page's
  // CancelOrderForm, which disappears the same way once the order isn't open.
  return (
    <>
      <TableRow
        className="cursor-pointer"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a, button")) return;
          router.push(href);
        }}
      >
        {children}
        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t("rowActions", { orderNo })} />}>
              <MoreVertical />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem render={<Link href={href} />}>{t("viewDetails")}</DropdownMenuItem>
              {shortcuts.map((s) => (
                <DropdownMenuItem key={s.key} render={s.external ? <a href={s.href} target={s.href.startsWith("tel:") ? undefined : "_blank"} rel="noopener" /> : <Link href={s.href} />}>
                  {s.label}
                </DropdownMenuItem>
              ))}
              {canCancel && (
                <DropdownMenuItem variant="destructive" onClick={() => setConfirmOpen(true)}>
                  {t("cancel")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>

      {canCancel && (
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent onClick={(e) => e.stopPropagation()}>
            <DialogHeader>
              <DialogTitle>{t("cancelTitle")}</DialogTitle>
              <DialogDescription>{t("cancelHint")}</DialogDescription>
            </DialogHeader>
            <form key={state.nonce ?? "form"} action={action} className="grid gap-3">
              <input type="hidden" name="orderId" value={orderId} />
              <FormMessage message={state.message} ok={state.ok} />
              <Field label={t("reason")} name="reason" required minLength={3} maxLength={500} error={state.fieldErrors?.reason} />
              <DialogFooter>
                <DialogClose render={<Button type="button" variant="outline" />}>{t("confirmCancel")}</DialogClose>
                <SubmitButton variant="destructive">{t("cancel")}</SubmitButton>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
