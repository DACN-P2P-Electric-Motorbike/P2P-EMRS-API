-- Phase 3D: mutual blind reviews for completed trips

CREATE TYPE "ReviewType" AS ENUM ('RENTER_TO_OWNER', 'OWNER_TO_RENTER');

ALTER TABLE "reviews"
ADD COLUMN "reviewee_id" TEXT,
ADD COLUMN "review_type" "ReviewType" NOT NULL DEFAULT 'RENTER_TO_OWNER',
ADD COLUMN "visible_at" TIMESTAMP(3),
ADD COLUMN "revealed_at" TIMESTAMP(3),
ADD COLUMN "trust_applied_at" TIMESTAMP(3);

UPDATE "reviews" AS r
SET
  "reviewee_id" = v."owner_id",
  "visible_at" = r."created_at",
  "revealed_at" = r."created_at",
  "trust_applied_at" = r."created_at"
FROM "vehicles" AS v
WHERE r."vehicle_id" = v."id";

ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "reviews_trip_id_key";

ALTER TABLE "reviews"
ADD CONSTRAINT "reviews_reviewee_id_fkey"
FOREIGN KEY ("reviewee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "reviews_trip_id_user_id_key" ON "reviews"("trip_id", "user_id");
CREATE INDEX "reviews_reviewee_id_idx" ON "reviews"("reviewee_id");
CREATE INDEX "reviews_review_type_idx" ON "reviews"("review_type");
CREATE INDEX "reviews_visible_at_idx" ON "reviews"("visible_at");
CREATE INDEX "reviews_revealed_at_idx" ON "reviews"("revealed_at");
