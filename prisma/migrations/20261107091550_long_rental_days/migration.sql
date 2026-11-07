-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "long_rental_days" INTEGER NOT NULL DEFAULT 30;

-- Hand-written: a sensible range for the follow-up threshold.
ALTER TABLE "settings" ADD CONSTRAINT "settings_long_rental_days" CHECK ("long_rental_days" BETWEEN 1 AND 365);
