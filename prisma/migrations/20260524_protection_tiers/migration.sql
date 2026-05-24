-- Phase 3C: internal/simulated protection plan tiers

CREATE TYPE "ProtectionPlanType" AS ENUM ('BASIC', 'STANDARD', 'PREMIUM');

ALTER TABLE "bookings"
ADD COLUMN "protection_plan" "ProtectionPlanType" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN "protection_fee" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "protection_deductible" DOUBLE PRECISION NOT NULL DEFAULT 1500000,
ADD COLUMN "protection_coverage_limit" DOUBLE PRECISION NOT NULL DEFAULT 15000000;
