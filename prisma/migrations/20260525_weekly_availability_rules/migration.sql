-- Phase 3S: recurring owner availability calendar rules

CREATE TYPE "AvailabilityWindowRecurrence" AS ENUM (
  'ONCE',
  'WEEKLY'
);

ALTER TABLE "vehicle_availability_windows"
ADD COLUMN "recurrence" "AvailabilityWindowRecurrence" NOT NULL DEFAULT 'ONCE',
ADD COLUMN "recurring_weekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN "timezone_offset_minutes" INTEGER,
ADD COLUMN "recurrence_ends_at" TIMESTAMP(3);

CREATE INDEX "vehicle_availability_windows_recurrence_idx"
ON "vehicle_availability_windows"("recurrence");
