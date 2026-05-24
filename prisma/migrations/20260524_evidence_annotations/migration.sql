-- Admin evidence annotations for claim adjudication

CREATE TYPE "EvidenceAnnotationTargetType" AS ENUM (
  'INCIDENT_REPORT',
  'POST_TRIP_CHARGE',
  'VEHICLE_HANDOVER',
  'HANDOVER_PHOTO'
);

CREATE TABLE "evidence_annotations" (
  "id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "claim_case_id" TEXT,
  "target_type" "EvidenceAnnotationTargetType" NOT NULL,
  "target_id" TEXT NOT NULL,
  "author_id" TEXT,
  "note" TEXT NOT NULL,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "highlight" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "evidence_annotations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "evidence_annotations_booking_id_idx" ON "evidence_annotations"("booking_id");
CREATE INDEX "evidence_annotations_claim_case_id_idx" ON "evidence_annotations"("claim_case_id");
CREATE INDEX "evidence_annotations_author_id_idx" ON "evidence_annotations"("author_id");
CREATE INDEX "evidence_annotations_target_type_target_id_idx" ON "evidence_annotations"("target_type", "target_id");
CREATE INDEX "evidence_annotations_created_at_idx" ON "evidence_annotations"("created_at");

ALTER TABLE "evidence_annotations"
ADD CONSTRAINT "evidence_annotations_booking_id_fkey"
FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "evidence_annotations"
ADD CONSTRAINT "evidence_annotations_claim_case_id_fkey"
FOREIGN KEY ("claim_case_id") REFERENCES "claim_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "evidence_annotations"
ADD CONSTRAINT "evidence_annotations_author_id_fkey"
FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
