-- Deposit ledger and post-trip charge workflow

CREATE TYPE "DepositLedgerStatus" AS ENUM (
  'NOT_HELD',
  'HELD',
  'PENDING_CHARGES',
  'PARTIALLY_CAPTURED',
  'CAPTURED',
  'RELEASE_PENDING',
  'RELEASED',
  'DISPUTED',
  'REFUNDED'
);

CREATE TYPE "PostTripChargeType" AS ENUM (
  'LATE_RETURN',
  'EXCESS_DISTANCE',
  'LOW_BATTERY',
  'CLEANING',
  'DAMAGE',
  'ROADSIDE_ASSISTANCE',
  'OTHER'
);

CREATE TYPE "PostTripChargeStatus" AS ENUM (
  'PENDING_REVIEW',
  'APPROVED',
  'WAIVED',
  'DISPUTED',
  'DEDUCTED_FROM_DEPOSIT',
  'PAID',
  'CANCELLED'
);

CREATE TYPE "PostTripChargeSource" AS ENUM (
  'SYSTEM',
  'OWNER',
  'ADMIN'
);

CREATE TABLE "deposit_ledgers" (
  "id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "payment_id" TEXT,
  "status" "DepositLedgerStatus" NOT NULL DEFAULT 'NOT_HELD',
  "held_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "pending_charge_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "captured_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "released_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "refunded_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "notes" TEXT,
  "held_at" TIMESTAMP(3),
  "release_due_at" TIMESTAMP(3),
  "released_at" TIMESTAMP(3),
  "disputed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "deposit_ledgers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "post_trip_charges" (
  "id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "trip_id" TEXT,
  "type" "PostTripChargeType" NOT NULL,
  "status" "PostTripChargeStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "source" "PostTripChargeSource" NOT NULL DEFAULT 'SYSTEM',
  "amount" DOUBLE PRECISION NOT NULL,
  "quantity" DOUBLE PRECISION,
  "unit_price" DOUBLE PRECISION,
  "description" TEXT NOT NULL,
  "evidence" JSONB,
  "reviewed_by" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "post_trip_charges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "deposit_ledgers_booking_id_key" ON "deposit_ledgers"("booking_id");
CREATE UNIQUE INDEX "deposit_ledgers_payment_id_key" ON "deposit_ledgers"("payment_id");
CREATE INDEX "deposit_ledgers_status_idx" ON "deposit_ledgers"("status");
CREATE INDEX "deposit_ledgers_release_due_at_idx" ON "deposit_ledgers"("release_due_at");

CREATE INDEX "post_trip_charges_booking_id_idx" ON "post_trip_charges"("booking_id");
CREATE INDEX "post_trip_charges_trip_id_idx" ON "post_trip_charges"("trip_id");
CREATE INDEX "post_trip_charges_type_idx" ON "post_trip_charges"("type");
CREATE INDEX "post_trip_charges_status_idx" ON "post_trip_charges"("status");
CREATE INDEX "post_trip_charges_source_idx" ON "post_trip_charges"("source");

ALTER TABLE "deposit_ledgers"
ADD CONSTRAINT "deposit_ledgers_booking_id_fkey"
FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deposit_ledgers"
ADD CONSTRAINT "deposit_ledgers_payment_id_fkey"
FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "post_trip_charges"
ADD CONSTRAINT "post_trip_charges_booking_id_fkey"
FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "post_trip_charges"
ADD CONSTRAINT "post_trip_charges_trip_id_fkey"
FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;
