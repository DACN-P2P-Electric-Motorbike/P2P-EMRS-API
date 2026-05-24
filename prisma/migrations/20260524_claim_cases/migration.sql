-- Durable claim cases with four-eyes Admin review

CREATE TYPE "ClaimCaseStatus" AS ENUM (
  'OPEN',
  'UNDER_REVIEW',
  'PENDING_SECOND_REVIEW',
  'APPROVED',
  'REJECTED',
  'RESOLVED',
  'CANCELLED'
);

CREATE TYPE "ClaimCaseOutcome" AS ENUM (
  'OWNER_CLAIM_APPROVED',
  'OWNER_CLAIM_PARTIALLY_APPROVED',
  'OWNER_CLAIM_REJECTED',
  'DEPOSIT_RELEASE_APPROVED',
  'PAYOUT_RELEASE_APPROVED',
  'NO_ACTION_REQUIRED'
);

CREATE TABLE "claim_cases" (
  "id" TEXT NOT NULL,
  "case_number" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "status" "ClaimCaseStatus" NOT NULL DEFAULT 'OPEN',
  "outcome" "ClaimCaseOutcome",
  "summary" TEXT,
  "opened_by" TEXT,
  "first_decision" "ClaimCaseOutcome",
  "first_reviewed_by" TEXT,
  "first_review_notes" TEXT,
  "first_reviewed_at" TIMESTAMP(3),
  "second_decision" "ClaimCaseOutcome",
  "second_reviewed_by" TEXT,
  "second_review_notes" TEXT,
  "second_reviewed_at" TIMESTAMP(3),
  "resolution_notes" TEXT,
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "claim_cases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "claim_cases_case_number_key" ON "claim_cases"("case_number");
CREATE UNIQUE INDEX "claim_cases_booking_id_key" ON "claim_cases"("booking_id");
CREATE INDEX "claim_cases_status_idx" ON "claim_cases"("status");
CREATE INDEX "claim_cases_outcome_idx" ON "claim_cases"("outcome");
CREATE INDEX "claim_cases_opened_by_idx" ON "claim_cases"("opened_by");
CREATE INDEX "claim_cases_first_reviewed_by_idx" ON "claim_cases"("first_reviewed_by");
CREATE INDEX "claim_cases_second_reviewed_by_idx" ON "claim_cases"("second_reviewed_by");
CREATE INDEX "claim_cases_created_at_idx" ON "claim_cases"("created_at");

ALTER TABLE "claim_cases"
ADD CONSTRAINT "claim_cases_booking_id_fkey"
FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "claim_cases"
ADD CONSTRAINT "claim_cases_opened_by_fkey"
FOREIGN KEY ("opened_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "claim_cases"
ADD CONSTRAINT "claim_cases_first_reviewed_by_fkey"
FOREIGN KEY ("first_reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "claim_cases"
ADD CONSTRAINT "claim_cases_second_reviewed_by_fkey"
FOREIGN KEY ("second_reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
