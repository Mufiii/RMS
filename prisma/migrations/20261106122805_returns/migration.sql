-- CreateEnum
CREATE TYPE "ReturnCondition" AS ENUM ('GOOD', 'DAMAGED', 'LOST');

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "return_line_id" INTEGER;

-- CreateTable
CREATE TABLE "returns" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "return_date" DATE NOT NULL,
    "is_backdated" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "received_by" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "LineStatus" NOT NULL DEFAULT 'ACTIVE',
    "voided_by" INTEGER,
    "voided_at" TIMESTAMPTZ,
    "void_reason" TEXT,

    CONSTRAINT "returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_lines" (
    "id" SERIAL NOT NULL,
    "return_id" INTEGER NOT NULL,
    "issue_line_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "condition" "ReturnCondition" NOT NULL,
    "days" INTEGER NOT NULL,
    "daily_rate" DECIMAL(12,2) NOT NULL,
    "rent_amount" DECIMAL(12,2) NOT NULL,
    "damage_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "damage_note" TEXT,

    CONSTRAINT "return_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "returns_order_id_idx" ON "returns"("order_id");

-- CreateIndex
CREATE INDEX "return_lines_issue_line_id_idx" ON "return_lines"("issue_line_id");

-- CreateIndex
CREATE INDEX "return_lines_return_id_idx" ON "return_lines"("return_id");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_return_line_id_fkey" FOREIGN KEY ("return_line_id") REFERENCES "return_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "rental_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_issue_line_id_fkey" FOREIGN KEY ("issue_line_id") REFERENCES "issue_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written constraints (docs/03-database-design.md)
-- ---------------------------------------------------------------------------
ALTER TABLE "returns" ADD CONSTRAINT "returns_void_fields"
  CHECK ("status" <> 'VOIDED' OR ("voided_by" IS NOT NULL AND "voided_at" IS NOT NULL AND length(btrim(coalesce("void_reason", ''))) > 0));

ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_days_min" CHECK ("days" >= 1);
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_rate_positive" CHECK ("daily_rate" > 0);
-- The database itself verifies the rent arithmetic.
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_rent_formula" CHECK ("rent_amount" = "quantity" * "daily_rate" * "days");
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_damage_nonneg" CHECK ("damage_amount" >= 0);
-- Good items carry no charge; damaged or lost items always carry a note.
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_damage_note"
  CHECK (("condition" = 'GOOD' AND "damage_amount" = 0) OR length(btrim(coalesce("damage_note", ''))) > 0);

-- Stock movements from returns point at their return line.
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_return_link"
  CHECK (("type" IN ('RETURN_DAMAGED', 'RETURN_LOST')) = ("return_line_id" IS NOT NULL));
