-- Phase 4C: roadside-support booking add-on with post-trip assistance credit

ALTER TABLE "bookings"
ADD COLUMN "roadside_support" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "roadside_support_fee" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "roadside_support_credit_amount" DOUBLE PRECISION NOT NULL DEFAULT 0;
