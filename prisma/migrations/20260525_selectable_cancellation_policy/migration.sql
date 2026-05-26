CREATE TYPE "CancellationPolicyType" AS ENUM ('FLEXIBLE', 'MODERATE', 'STRICT');

ALTER TABLE "vehicles"
ADD COLUMN "cancellation_policy" "CancellationPolicyType" NOT NULL DEFAULT 'FLEXIBLE';

ALTER TABLE "bookings"
ADD COLUMN "cancellation_policy" "CancellationPolicyType" NOT NULL DEFAULT 'FLEXIBLE';
