-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('ADVANCE', 'PAYMENT', 'REFUND');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE');

-- CreateTable
CREATE TABLE "payments" (
    "id" SERIAL NOT NULL,
    "receipt_no" TEXT NOT NULL,
    "order_id" INTEGER NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "type" "PaymentType" NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_date" DATE NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "status" "LineStatus" NOT NULL DEFAULT 'ACTIVE',
    "voided_by" INTEGER,
    "voided_at" TIMESTAMPTZ,
    "void_reason" TEXT,
    "received_by" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_receipt_no_key" ON "payments"("receipt_no");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "payments_customer_id_idx" ON "payments"("customer_id");

-- CreateIndex
CREATE INDEX "payments_payment_date_idx" ON "payments"("payment_date");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "rental_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written constraints (docs/03-database-design.md)
-- ---------------------------------------------------------------------------
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_void_fields"
  CHECK ("status" <> 'VOIDED' OR ("voided_by" IS NOT NULL AND "voided_at" IS NOT NULL AND length(btrim(coalesce("void_reason", ''))) > 0));
-- A cheque payment always carries its cheque number.
ALTER TABLE "payments" ADD CONSTRAINT "payments_cheque_reference"
  CHECK ("mode" <> 'CHEQUE' OR length(btrim(coalesce("reference", ''))) > 0);

-- Payments are never deleted, and the only change allowed is ACTIVE → VOIDED.
CREATE OR REPLACE FUNCTION payments_only_void() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'payments are never deleted';
  END IF;
  IF OLD."status" <> 'ACTIVE' OR NEW."status" <> 'VOIDED'
     OR (to_jsonb(NEW) - ARRAY['status', 'voided_by', 'voided_at', 'void_reason'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'voided_by', 'voided_at', 'void_reason']) THEN
    RAISE EXCEPTION 'a payment can only be voided';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payments_only_void
  BEFORE UPDATE OR DELETE ON "payments"
  FOR EACH ROW EXECUTE FUNCTION payments_only_void();
