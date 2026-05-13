-- Trust score mechanics: event audit log, progressive warnings, and restricted users.
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'RESTRICTED';

CREATE TYPE "TrustScoreEventType" AS ENUM (
  'TRIP_COMPLETED_ON_TIME',
  'GOOD_REVIEW_RECEIVED',
  'REVIEW_SUBMITTED',
  'KYC_VERIFIED',
  'TRANSACTION_MILESTONE',
  'BAD_REVIEW_RECEIVED',
  'BOOKING_CANCELLED_BY_RENTER',
  'BOOKING_REJECTED_BY_OWNER',
  'LATE_RETURN',
  'CONFIRMED_REPORT',
  'SERIOUS_VIOLATION',
  'MANUAL_ADJUSTMENT',
  'RECALCULATED',
  'WARNING'
);

CREATE TABLE "trust_score_events" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "type" "TrustScoreEventType" NOT NULL,
  "delta" DOUBLE PRECISION NOT NULL,
  "score_before" DOUBLE PRECISION NOT NULL,
  "score_after" DOUBLE PRECISION NOT NULL,
  "reason" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "trust_score_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "trust_score_warnings" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "type" "TrustScoreEventType" NOT NULL,
  "reason" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "penalized_at" TIMESTAMP(3),
  CONSTRAINT "trust_score_warnings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trust_score_events_user_id_idx" ON "trust_score_events"("user_id");
CREATE INDEX "trust_score_events_type_idx" ON "trust_score_events"("type");
CREATE INDEX "trust_score_events_created_at_idx" ON "trust_score_events"("created_at");

CREATE INDEX "trust_score_warnings_user_id_idx" ON "trust_score_warnings"("user_id");
CREATE INDEX "trust_score_warnings_type_idx" ON "trust_score_warnings"("type");
CREATE INDEX "trust_score_warnings_expires_at_idx" ON "trust_score_warnings"("expires_at");

ALTER TABLE "trust_score_events"
  ADD CONSTRAINT "trust_score_events_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "trust_score_warnings"
  ADD CONSTRAINT "trust_score_warnings_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
