-- Phase 3A: owner availability calendar and EV condition metadata

CREATE TYPE "VehicleCondition" AS ENUM (
  'NEW',
  'LIKE_NEW',
  'GOOD',
  'FAIR',
  'NEEDS_MAINTENANCE'
);

CREATE TYPE "BatteryType" AS ENUM (
  'FIXED_NON_REMOVABLE',
  'REMOVABLE',
  'SWAPPABLE'
);

CREATE TYPE "AvailabilityWindowType" AS ENUM (
  'AVAILABLE',
  'BLOCKED'
);

ALTER TABLE "vehicles"
ADD COLUMN "first_registration_year" INTEGER,
ADD COLUMN "condition" "VehicleCondition",
ADD COLUMN "battery_type" "BatteryType",
ADD COLUMN "battery_health" INTEGER,
ADD COLUMN "battery_cycle_count" INTEGER,
ADD COLUMN "battery_last_serviced_at" TIMESTAMP(3);

CREATE TABLE "vehicle_availability_windows" (
  "id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "type" "AvailabilityWindowType" NOT NULL,
  "start_time" TIMESTAMP(3) NOT NULL,
  "end_time" TIMESTAMP(3) NOT NULL,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "vehicle_availability_windows_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "vehicle_availability_windows_vehicle_id_idx" ON "vehicle_availability_windows"("vehicle_id");
CREATE INDEX "vehicle_availability_windows_type_idx" ON "vehicle_availability_windows"("type");
CREATE INDEX "vehicle_availability_windows_start_time_end_time_idx" ON "vehicle_availability_windows"("start_time", "end_time");

ALTER TABLE "vehicle_availability_windows"
ADD CONSTRAINT "vehicle_availability_windows_vehicle_id_fkey"
FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
