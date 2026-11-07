-- The first version of this CHECK let logo bytes without a type through:
-- with logo_mime NULL, "logo_mime IN (...)" is NULL, and a CHECK passes on NULL.
-- Every branch now compares only non-NULL values.
ALTER TABLE "settings" DROP CONSTRAINT "settings_logo";
ALTER TABLE "settings" ADD CONSTRAINT "settings_logo" CHECK (
  ("logo_data" IS NULL AND "logo_mime" IS NULL)
  OR ("logo_data" IS NOT NULL AND "logo_mime" IS NOT NULL
      AND "logo_mime" IN ('image/png', 'image/jpeg') AND octet_length("logo_data") <= 307200));
