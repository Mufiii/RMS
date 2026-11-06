-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LineStatus" AS ENUM ('ACTIVE', 'VOIDED');

-- CreateTable
CREATE TABLE "rental_orders" (
    "id" SERIAL NOT NULL,
    "order_no" TEXT NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'OPEN',
    "site_address" TEXT,
    "notes" TEXT,
    "opened_on" DATE NOT NULL,
    "closed_at" TIMESTAMPTZ,
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMPTZ,
    "cancel_reason" TEXT,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "rental_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issues" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "issue_date" DATE NOT NULL,
    "is_backdated" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "issued_by" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_lines" (
    "id" SERIAL NOT NULL,
    "issue_id" INTEGER NOT NULL,
    "order_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "unit_id" INTEGER,
    "quantity" INTEGER NOT NULL,
    "qty_returned" INTEGER NOT NULL DEFAULT 0,
    "daily_rate" DECIMAL(12,2) NOT NULL,
    "status" "LineStatus" NOT NULL DEFAULT 'ACTIVE',
    "voided_by" INTEGER,
    "voided_at" TIMESTAMPTZ,
    "void_reason" TEXT,

    CONSTRAINT "issue_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rental_orders_order_no_key" ON "rental_orders"("order_no");

-- CreateIndex
CREATE INDEX "rental_orders_customer_id_status_idx" ON "rental_orders"("customer_id", "status");

-- CreateIndex
CREATE INDEX "rental_orders_status_opened_on_idx" ON "rental_orders"("status", "opened_on");

-- CreateIndex
CREATE INDEX "issues_order_id_idx" ON "issues"("order_id");

-- CreateIndex
CREATE INDEX "issue_lines_order_id_idx" ON "issue_lines"("order_id");

-- CreateIndex
CREATE INDEX "issue_lines_issue_id_idx" ON "issue_lines"("issue_id");

-- AddForeignKey
ALTER TABLE "rental_orders" ADD CONSTRAINT "rental_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_orders" ADD CONSTRAINT "rental_orders_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_orders" ADD CONSTRAINT "rental_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "rental_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_lines" ADD CONSTRAINT "issue_lines_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_lines" ADD CONSTRAINT "issue_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "rental_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_lines" ADD CONSTRAINT "issue_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_lines" ADD CONSTRAINT "issue_lines_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "product_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_lines" ADD CONSTRAINT "issue_lines_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written constraints (docs/03-database-design.md)
-- ---------------------------------------------------------------------------
ALTER TABLE "rental_orders" ADD CONSTRAINT "rental_orders_cancel_reason"
  CHECK ("status" <> 'CANCELLED' OR (length(btrim(coalesce("cancel_reason", ''))) > 0 AND "cancelled_by" IS NOT NULL AND "cancelled_at" IS NOT NULL));
ALTER TABLE "rental_orders" ADD CONSTRAINT "rental_orders_closed_at"
  CHECK ("status" <> 'CLOSED' OR "closed_at" IS NOT NULL);

ALTER TABLE "issue_lines" ADD CONSTRAINT "issue_lines_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "issue_lines" ADD CONSTRAINT "issue_lines_unit_single" CHECK ("unit_id" IS NULL OR "quantity" = 1);
-- Over-return is impossible.
ALTER TABLE "issue_lines" ADD CONSTRAINT "issue_lines_returned_range" CHECK ("qty_returned" BETWEEN 0 AND "quantity");
ALTER TABLE "issue_lines" ADD CONSTRAINT "issue_lines_rate_positive" CHECK ("daily_rate" > 0);
-- A line can only be voided before anything was returned, and must say who/why.
ALTER TABLE "issue_lines" ADD CONSTRAINT "issue_lines_void_fields"
  CHECK ("status" <> 'VOIDED' OR ("qty_returned" = 0 AND "voided_by" IS NOT NULL AND "voided_at" IS NOT NULL AND length(btrim(coalesce("void_reason", ''))) > 0));

-- One physical unit can never be out on two rentals at once.
CREATE UNIQUE INDEX "issue_lines_unit_out_once" ON "issue_lines" ("unit_id")
  WHERE "unit_id" IS NOT NULL AND "status" = 'ACTIVE' AND "qty_returned" < "quantity";

-- Items currently out, per product (availability and reconciliation).
CREATE INDEX "issue_lines_product_out_idx" ON "issue_lines" ("product_id")
  WHERE "status" = 'ACTIVE' AND "qty_returned" < "quantity";
