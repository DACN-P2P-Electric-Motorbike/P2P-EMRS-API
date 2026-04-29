ALTER TYPE "OtpType" ADD VALUE IF NOT EXISTS 'SENSITIVE_PROFILE_CHANGE';
ALTER TYPE "OtpType" ADD VALUE IF NOT EXISTS 'FINANCIAL_TRANSACTION';

CREATE TYPE "PrivacyRequestType" AS ENUM ('ACCESS_DATA', 'DELETE_ACCOUNT');
CREATE TYPE "PrivacyRequestStatus" AS ENUM ('PENDING', 'COMPLETED', 'REJECTED');

CREATE TABLE "privacy_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "PrivacyRequestType" NOT NULL,
    "status" "PrivacyRequestStatus" NOT NULL DEFAULT 'PENDING',
    "due_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "privacy_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "privacy_requests_user_id_idx" ON "privacy_requests"("user_id");
CREATE INDEX "privacy_requests_status_idx" ON "privacy_requests"("status");
CREATE INDEX "privacy_requests_due_at_idx" ON "privacy_requests"("due_at");

ALTER TABLE "privacy_requests"
ADD CONSTRAINT "privacy_requests_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
