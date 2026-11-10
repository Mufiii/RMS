-- Order numbers become PREFIX-0001, counted for all time instead of per financial year.
-- The counter lives in one ('ORDER', 'ALL') row; old per-year rows stay as history.
ALTER TABLE "number_sequences" DROP CONSTRAINT "number_sequences_fiscal_year_format";
ALTER TABLE "number_sequences" ADD CONSTRAINT "number_sequences_fiscal_year_format"
  CHECK ("fiscal_year" ~ '^[0-9]{4}-[0-9]{2}$' OR ("fiscal_year" = 'ALL' AND "doc_type" = 'ORDER'));

-- Continue after the highest existing order number so a short search never matches two orders.
INSERT INTO "number_sequences" ("doc_type", "fiscal_year", "next_value")
SELECT 'ORDER'::"DocType", 'ALL', COALESCE(MAX(substring("order_no" from '[0-9]+$')::int), 0) + 1
FROM "rental_orders";
