-- Phase 1 listing and booking-flow enhancements: vehicle policies, instant book,
-- cancellation attribution, and checkout soft locks.
ALTER TABLE "vehicles" ADD COLUMN "instant_book" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "vehicles" ADD COLUMN "daily_km_limit" INTEGER;
ALTER TABLE "vehicles" ADD COLUMN "excess_km_price" DOUBLE PRECISION;
ALTER TABLE "vehicles" ADD COLUMN "weekly_discount" DOUBLE PRECISION;
ALTER TABLE "vehicles" ADD COLUMN "monthly_discount" DOUBLE PRECISION;
ALTER TABLE "vehicles" ADD COLUMN "allow_smoke" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "vehicles" ADD COLUMN "allow_pets" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "vehicles" ADD COLUMN "geo_restriction" TEXT;
ALTER TABLE "vehicles" ADD COLUMN "battery_return_min" INTEGER;

ALTER TABLE "bookings" ADD COLUMN "cancelled_by" TEXT;

CREATE TABLE "booking_locks" (
  "id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "start_time" TIMESTAMP(3) NOT NULL,
  "end_time" TIMESTAMP(3) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_locks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "booking_locks_vehicle_id_idx" ON "booking_locks"("vehicle_id");
CREATE INDEX "booking_locks_user_id_idx" ON "booking_locks"("user_id");
CREATE INDEX "booking_locks_expires_at_idx" ON "booking_locks"("expires_at");

ALTER TABLE "booking_locks"
  ADD CONSTRAINT "booking_locks_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_locks"
  ADD CONSTRAINT "booking_locks_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
