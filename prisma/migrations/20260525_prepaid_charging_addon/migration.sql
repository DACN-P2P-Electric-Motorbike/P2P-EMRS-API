-- Phase 4A: bounded prepaid charging add-on for EV return battery policy

ALTER TABLE "bookings"
ADD COLUMN "prepaid_charging" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "prepaid_charging_fee" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "prepaid_charging_credit_percent" INTEGER NOT NULL DEFAULT 0;
