-- Phase 2: KYC verification workflow

CREATE TYPE "KycStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "kyc_verifications" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "selfie_url" TEXT NOT NULL,
  "id_card_front_url" TEXT NOT NULL,
  "id_card_back_url" TEXT NOT NULL,
  "status" "KycStatus" NOT NULL DEFAULT 'PENDING',
  "rejection_reason" TEXT,
  "reviewed_by" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "kyc_verifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "kyc_verifications_user_id_key" ON "kyc_verifications"("user_id");
CREATE INDEX "kyc_verifications_status_idx" ON "kyc_verifications"("status");
CREATE INDEX "kyc_verifications_reviewed_by_idx" ON "kyc_verifications"("reviewed_by");

ALTER TABLE "kyc_verifications"
  ADD CONSTRAINT "kyc_verifications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "kyc_verifications"
  ADD CONSTRAINT "kyc_verifications_reviewed_by_fkey"
  FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
