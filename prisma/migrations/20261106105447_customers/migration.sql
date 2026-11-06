-- CreateTable
CREATE TABLE "customers" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "alt_phone" TEXT,
    "address" TEXT,
    "id_proof_type" TEXT,
    "id_proof_number" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_phone_idx" ON "customers"("phone");

-- CreateIndex
CREATE INDEX "customers_alt_phone_idx" ON "customers"("alt_phone");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written constraints (docs/03-database-design.md)
-- ---------------------------------------------------------------------------
CREATE INDEX "customers_lower_name_idx" ON "customers" (lower("name"));

ALTER TABLE "customers" ADD CONSTRAINT "customers_name_not_blank" CHECK (length(btrim("name")) > 0);
ALTER TABLE "customers" ADD CONSTRAINT "customers_phone_digits" CHECK ("phone" ~ '^[0-9]{6,15}$');
ALTER TABLE "customers" ADD CONSTRAINT "customers_alt_phone_digits" CHECK ("alt_phone" IS NULL OR "alt_phone" ~ '^[0-9]{6,15}$');
ALTER TABLE "customers" ADD CONSTRAINT "customers_id_proof_pair" CHECK ("id_proof_number" IS NULL OR "id_proof_type" IS NOT NULL);
