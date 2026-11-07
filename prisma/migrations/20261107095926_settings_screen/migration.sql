/*
  Warnings:

  - You are about to drop the column `logo_path` on the `settings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "settings" DROP COLUMN "logo_path",
ADD COLUMN     "logo_data" BYTEA,
ADD COLUMN     "logo_mime" TEXT,
ADD COLUMN     "logo_updated_at" TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- Hand-written constraints (Step 9: settings screen)
-- ---------------------------------------------------------------------------
-- Prefixes: short, upper-case letters/digits/hyphen (no "/" — it separates the parts of a number).
ALTER TABLE "settings" ADD CONSTRAINT "settings_prefix_format" CHECK (
  "order_prefix" ~ '^[A-Z0-9-]{1,10}$' AND "invoice_prefix" ~ '^[A-Z0-9-]{1,10}$'
  AND "receipt_prefix" ~ '^[A-Z0-9-]{1,10}$' AND "refund_prefix" ~ '^[A-Z0-9-]{1,10}$');
-- All four differ: receipts and refunds share one number column, so equal prefixes would collide.
ALTER TABLE "settings" ADD CONSTRAINT "settings_prefixes_distinct" CHECK (
  "order_prefix" <> "invoice_prefix" AND "order_prefix" <> "receipt_prefix" AND "order_prefix" <> "refund_prefix"
  AND "invoice_prefix" <> "receipt_prefix" AND "invoice_prefix" <> "refund_prefix" AND "receipt_prefix" <> "refund_prefix");
ALTER TABLE "settings" ADD CONSTRAINT "settings_business_name" CHECK (length(btrim("business_name")) > 0);
ALTER TABLE "settings" ADD CONSTRAINT "settings_logo" CHECK (
  ("logo_data" IS NULL AND "logo_mime" IS NULL)
  OR ("logo_data" IS NOT NULL AND "logo_mime" IN ('image/png', 'image/jpeg') AND octet_length("logo_data") <= 307200));
