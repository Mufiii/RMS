-- CreateEnum
CREATE TYPE "Tracking" AS ENUM ('SERIALISED', 'QUANTITY');

-- CreateEnum
CREATE TYPE "UnitStatus" AS ENUM ('AVAILABLE', 'RENTED', 'UNDER_REPAIR', 'LOST', 'RETIRED');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('OPENING', 'PURCHASE', 'WRITE_OFF', 'SENT_TO_REPAIR', 'REPAIR_DONE', 'REPAIR_SCRAPPED', 'RETURN_DAMAGED', 'RETURN_LOST', 'CORRECTION');

-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "name_ml" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" SERIAL NOT NULL,
    "category_id" INTEGER NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "name_ml" TEXT,
    "tracking" "Tracking" NOT NULL,
    "daily_rate" DECIMAL(12,2) NOT NULL,
    "qty_owned" INTEGER NOT NULL DEFAULT 0,
    "qty_out" INTEGER NOT NULL DEFAULT 0,
    "qty_repair" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_units" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "serial_no" TEXT NOT NULL,
    "status" "UnitStatus" NOT NULL DEFAULT 'AVAILABLE',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "unit_id" INTEGER,
    "type" "MovementType" NOT NULL,
    "delta_owned" INTEGER NOT NULL,
    "delta_repair" INTEGER NOT NULL,
    "reason" TEXT,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "products_code_key" ON "products"("code");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "product_units_product_id_status_idx" ON "product_units"("product_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "product_units_product_id_serial_no_key" ON "product_units"("product_id", "serial_no");

-- CreateIndex
CREATE INDEX "stock_movements_product_id_id_idx" ON "stock_movements"("product_id", "id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "product_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written constraints (docs/03-database-design.md)
-- ---------------------------------------------------------------------------
ALTER TABLE "categories" ADD CONSTRAINT "categories_name_not_blank" CHECK (length(btrim("name")) > 0);
CREATE UNIQUE INDEX "categories_lower_name_key" ON "categories" (lower("name"));

ALTER TABLE "products" ADD CONSTRAINT "products_name_not_blank" CHECK (length(btrim("name")) > 0);
ALTER TABLE "products" ADD CONSTRAINT "products_code_format" CHECK ("code" IS NULL OR "code" ~ '^[A-Z0-9][A-Z0-9-]{0,19}$');
ALTER TABLE "products" ADD CONSTRAINT "products_daily_rate_positive" CHECK ("daily_rate" > 0);
ALTER TABLE "products" ADD CONSTRAINT "products_qty_owned_nonneg" CHECK ("qty_owned" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_qty_out_nonneg" CHECK ("qty_out" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_qty_repair_nonneg" CHECK ("qty_repair" >= 0);
-- Overselling is impossible: what is out plus what is in repair never exceeds what is owned.
ALTER TABLE "products" ADD CONSTRAINT "products_stock_balance" CHECK ("qty_out" + "qty_repair" <= "qty_owned");
CREATE INDEX "products_lower_name_idx" ON "products" (lower("name"));

ALTER TABLE "product_units" ADD CONSTRAINT "product_units_serial_not_blank" CHECK (length(btrim("serial_no")) > 0);

ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_nonzero" CHECK ("delta_owned" <> 0 OR "delta_repair" <> 0);
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reason_required"
  CHECK ("type" NOT IN ('WRITE_OFF', 'CORRECTION', 'REPAIR_SCRAPPED') OR length(btrim(coalesce("reason", ''))) > 0);

-- The stock ledger is append-only, like the audit log.
CREATE OR REPLACE FUNCTION stock_movements_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'stock_movements is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stock_movements_no_update_delete
  BEFORE UPDATE OR DELETE ON "stock_movements"
  FOR EACH ROW EXECUTE FUNCTION stock_movements_append_only();
