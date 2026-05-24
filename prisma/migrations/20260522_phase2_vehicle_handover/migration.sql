-- Phase 2: Vehicle handover / check-in / check-out workflow

CREATE TYPE "HandoverType" AS ENUM ('CHECK_IN', 'CHECK_OUT');

CREATE TABLE "vehicle_handovers" (
  "id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "trip_id" TEXT,
  "type" "HandoverType" NOT NULL,
  "performed_by" TEXT NOT NULL,
  "odometer_reading" DOUBLE PRECISION,
  "battery_level" INTEGER,
  "fuel_level" INTEGER,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "notes" TEXT,
  "confirmed_by_owner" BOOLEAN NOT NULL DEFAULT false,
  "confirmed_by_renter" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "vehicle_handovers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "handover_photos" (
  "id" TEXT NOT NULL,
  "handover_id" TEXT NOT NULL,
  "photo_url" TEXT NOT NULL,
  "photo_type" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "captured_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "handover_photos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vehicle_handovers_booking_id_type_key"
  ON "vehicle_handovers"("booking_id", "type");
CREATE INDEX "vehicle_handovers_booking_id_idx" ON "vehicle_handovers"("booking_id");
CREATE INDEX "vehicle_handovers_trip_id_idx" ON "vehicle_handovers"("trip_id");
CREATE INDEX "vehicle_handovers_performed_by_idx" ON "vehicle_handovers"("performed_by");
CREATE INDEX "vehicle_handovers_type_idx" ON "vehicle_handovers"("type");
CREATE INDEX "handover_photos_handover_id_idx" ON "handover_photos"("handover_id");
CREATE INDEX "handover_photos_photo_type_idx" ON "handover_photos"("photo_type");

ALTER TABLE "vehicle_handovers"
  ADD CONSTRAINT "vehicle_handovers_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicle_handovers"
  ADD CONSTRAINT "vehicle_handovers_trip_id_fkey"
  FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "vehicle_handovers"
  ADD CONSTRAINT "vehicle_handovers_performed_by_fkey"
  FOREIGN KEY ("performed_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "handover_photos"
  ADD CONSTRAINT "handover_photos_handover_id_fkey"
  FOREIGN KEY ("handover_id") REFERENCES "vehicle_handovers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
