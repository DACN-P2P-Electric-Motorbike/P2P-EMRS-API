-- Phase 3F: owner payout ledger and admin payout operations

CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'ON_HOLD', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

CREATE TABLE "owner_payouts" (
  "id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "owner_id" TEXT NOT NULL,
  "payment_id" TEXT,
  "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
  "gross_rental_amount" DOUBLE PRECISION NOT NULL,
  "platform_fee" DOUBLE PRECISION NOT NULL,
  "owner_rental_amount" DOUBLE PRECISION NOT NULL,
  "post_trip_charge_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "payout_amount" DOUBLE PRECISION NOT NULL,
  "hold_reason" TEXT,
  "external_reference" TEXT,
  "notes" TEXT,
  "created_by" TEXT,
  "processed_by" TEXT,
  "processed_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "owner_payouts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "owner_payouts_booking_id_key" ON "owner_payouts"("booking_id");
CREATE UNIQUE INDEX "owner_payouts_payment_id_key" ON "owner_payouts"("payment_id");
CREATE INDEX "owner_payouts_owner_id_idx" ON "owner_payouts"("owner_id");
CREATE INDEX "owner_payouts_status_idx" ON "owner_payouts"("status");
CREATE INDEX "owner_payouts_created_at_idx" ON "owner_payouts"("created_at");

ALTER TABLE "owner_payouts"
ADD CONSTRAINT "owner_payouts_booking_id_fkey"
FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "owner_payouts"
ADD CONSTRAINT "owner_payouts_owner_id_fkey"
FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "owner_payouts"
ADD CONSTRAINT "owner_payouts_payment_id_fkey"
FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
