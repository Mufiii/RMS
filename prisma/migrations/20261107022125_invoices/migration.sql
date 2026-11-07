-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'CANCELLED');

-- CreateTable
CREATE TABLE "invoices" (
    "id" SERIAL NOT NULL,
    "invoice_no" TEXT NOT NULL,
    "order_id" INTEGER NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "invoice_date" DATE NOT NULL,
    "order_no" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_phone" TEXT NOT NULL,
    "customer_address" TEXT,
    "site_address" TEXT,
    "rent_total" DECIMAL(12,2) NOT NULL,
    "damage_total" DECIMAL(12,2) NOT NULL,
    "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount_reason" TEXT,
    "total" DECIMAL(12,2) NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMPTZ,
    "cancel_reason" TEXT,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" SERIAL NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "product_name" TEXT NOT NULL,
    "product_name_ml" TEXT,
    "serial_no" TEXT,
    "quantity" INTEGER NOT NULL,
    "issue_date" DATE NOT NULL,
    "return_date" DATE NOT NULL,
    "days" INTEGER NOT NULL,
    "daily_rate" DECIMAL(12,2) NOT NULL,
    "rent_amount" DECIMAL(12,2) NOT NULL,
    "condition" "ReturnCondition" NOT NULL,
    "damage_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "damage_note" TEXT,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_no_key" ON "invoices"("invoice_no");

-- CreateIndex
CREATE INDEX "invoices_order_id_idx" ON "invoices"("order_id");

-- CreateIndex
CREATE INDEX "invoices_invoice_date_idx" ON "invoices"("invoice_date");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_lines_invoice_id_sort_order_key" ON "invoice_lines"("invoice_id", "sort_order");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "rental_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written constraints (docs/03-database-design.md)
-- ---------------------------------------------------------------------------
-- An order has at most one live invoice; cancelled ones stay.
CREATE UNIQUE INDEX "invoices_one_issued_per_order" ON "invoices"("order_id") WHERE "status" = 'ISSUED';

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_totals_nonneg" CHECK ("rent_total" >= 0 AND "damage_total" >= 0);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_discount_range"
  CHECK ("discount_amount" >= 0 AND "discount_amount" <= "rent_total" + "damage_total");
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_discount_reason"
  CHECK ("discount_amount" = 0 OR length(btrim(coalesce("discount_reason", ''))) > 0);
-- The database itself verifies the invoice arithmetic.
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_total_formula"
  CHECK ("total" = "rent_total" + "damage_total" - "discount_amount");
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_cancel_fields"
  CHECK ("status" <> 'CANCELLED' OR ("cancelled_by" IS NOT NULL AND "cancelled_at" IS NOT NULL AND length(btrim(coalesce("cancel_reason", ''))) > 0));

ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_days_min" CHECK ("days" >= 1);
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_days_formula" CHECK ("days" = "return_date" - "issue_date" + 1);
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_rate_positive" CHECK ("daily_rate" > 0);
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_rent_formula" CHECK ("rent_amount" = "quantity" * "daily_rate" * "days");
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_damage_nonneg" CHECK ("damage_amount" >= 0);

-- Snapshots are immutable: invoice lines never change, and an invoice can
-- only move ISSUED → CANCELLED (setting the cancel fields), nothing else.
CREATE OR REPLACE FUNCTION invoice_lines_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'invoice_lines are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoice_lines_no_update_delete
  BEFORE UPDATE OR DELETE ON "invoice_lines"
  FOR EACH ROW EXECUTE FUNCTION invoice_lines_immutable();

CREATE OR REPLACE FUNCTION invoices_only_cancel() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'invoices are never deleted';
  END IF;
  IF OLD."status" <> 'ISSUED' OR NEW."status" <> 'CANCELLED'
     OR (to_jsonb(NEW) - ARRAY['status', 'cancelled_by', 'cancelled_at', 'cancel_reason'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'cancelled_by', 'cancelled_at', 'cancel_reason']) THEN
    RAISE EXCEPTION 'an invoice can only be cancelled';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoices_only_cancel
  BEFORE UPDATE OR DELETE ON "invoices"
  FOR EACH ROW EXECUTE FUNCTION invoices_only_cancel();
