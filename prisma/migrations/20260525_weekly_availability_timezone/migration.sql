-- Phase 3Z: named-zone evaluation for recurring availability rules
ALTER TABLE "vehicle_availability_windows"
ADD COLUMN "timezone_name" TEXT;

-- Existing DreamRide Vietnam rules can be upgraded without changing wall time.
UPDATE "vehicle_availability_windows"
SET "timezone_name" = 'Asia/Ho_Chi_Minh'
WHERE "recurrence" = 'WEEKLY'
  AND "timezone_offset_minutes" = 420;
