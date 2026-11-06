-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('en', 'ml');

-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('ORDER', 'INVOICE', 'RECEIPT', 'REFUND');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "locale" "Locale" NOT NULL DEFAULT 'en',
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "session_version" INTEGER NOT NULL DEFAULT 1,
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actor_id" INTEGER,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "summary" JSONB,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_sequences" (
    "doc_type" "DocType" NOT NULL,
    "fiscal_year" TEXT NOT NULL,
    "next_value" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "number_sequences_pkey" PRIMARY KEY ("doc_type","fiscal_year")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "business_name" TEXT NOT NULL,
    "business_name_ml" TEXT,
    "address" TEXT,
    "address_ml" TEXT,
    "phones" TEXT,
    "email" TEXT,
    "order_prefix" TEXT NOT NULL DEFAULT 'ORD',
    "invoice_prefix" TEXT NOT NULL DEFAULT 'INV',
    "receipt_prefix" TEXT NOT NULL DEFAULT 'RCP',
    "refund_prefix" TEXT NOT NULL DEFAULT 'RFD',
    "invoice_terms" TEXT,
    "invoice_terms_ml" TEXT,
    "logo_path" TEXT,
    "print_paper_width_mm" INTEGER NOT NULL DEFAULT 80,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written constraints (docs/03-database-design.md)
-- ---------------------------------------------------------------------------
ALTER TABLE "users" ADD CONSTRAINT "users_username_lowercase" CHECK ("username" = lower("username") AND length("username") >= 3);
ALTER TABLE "users" ADD CONSTRAINT "users_session_version_positive" CHECK ("session_version" >= 1);

ALTER TABLE "number_sequences" ADD CONSTRAINT "number_sequences_next_value_positive" CHECK ("next_value" >= 1);
ALTER TABLE "number_sequences" ADD CONSTRAINT "number_sequences_fiscal_year_format" CHECK ("fiscal_year" ~ '^[0-9]{4}-[0-9]{2}$');

ALTER TABLE "settings" ADD CONSTRAINT "settings_single_row" CHECK ("id" = 1);
ALTER TABLE "settings" ADD CONSTRAINT "settings_paper_width" CHECK ("print_paper_width_mm" IN (58, 80));

-- The audit log is append-only: the app never updates or deletes rows.
CREATE OR REPLACE FUNCTION audit_logs_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();
