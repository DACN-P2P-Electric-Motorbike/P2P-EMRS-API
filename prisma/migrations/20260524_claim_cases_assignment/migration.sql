-- Claim case assignment for Admin case-management ownership

ALTER TABLE "claim_cases"
ADD COLUMN IF NOT EXISTS "assigned_admin_id" TEXT,
ADD COLUMN IF NOT EXISTS "assigned_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "claim_cases_assigned_admin_id_idx" ON "claim_cases"("assigned_admin_id");
CREATE INDEX IF NOT EXISTS "claim_cases_assigned_at_idx" ON "claim_cases"("assigned_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'claim_cases_assigned_admin_id_fkey'
  ) THEN
    ALTER TABLE "claim_cases"
    ADD CONSTRAINT "claim_cases_assigned_admin_id_fkey"
    FOREIGN KEY ("assigned_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
