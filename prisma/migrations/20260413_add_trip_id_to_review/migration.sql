-- Add optional tripId FK to reviews table
-- Each trip can have at most one review (UNIQUE constraint)
ALTER TABLE "reviews" ADD COLUMN "trip_id" TEXT;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_trip_id_key" UNIQUE ("trip_id");
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_trip_id_fkey"
  FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;
