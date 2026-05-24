-- Incident report workflow for trust/safety review and claim foundation

CREATE TYPE "IncidentCategory" AS ENUM (
  'ACCIDENT',
  'DAMAGE',
  'THEFT',
  'MECHANICAL_ISSUE',
  'NO_SHOW',
  'VEHICLE_MISMATCH',
  'LATE_RETURN',
  'OTHER'
);

CREATE TYPE "IncidentSeverity" AS ENUM (
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL'
);

CREATE TYPE "IncidentStatus" AS ENUM (
  'OPEN',
  'UNDER_REVIEW',
  'RESOLVED',
  'REJECTED'
);

CREATE TABLE "incident_reports" (
  "id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "trip_id" TEXT,
  "post_trip_charge_id" TEXT,
  "reporter_id" TEXT NOT NULL,
  "category" "IncidentCategory" NOT NULL,
  "severity" "IncidentSeverity" NOT NULL DEFAULT 'MEDIUM',
  "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
  "description" TEXT NOT NULL,
  "evidence" JSONB,
  "required_evidence" JSONB,
  "admin_notes" TEXT,
  "reviewed_by" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "incident_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "incident_reports_booking_id_idx" ON "incident_reports"("booking_id");
CREATE INDEX "incident_reports_trip_id_idx" ON "incident_reports"("trip_id");
CREATE INDEX "incident_reports_post_trip_charge_id_idx" ON "incident_reports"("post_trip_charge_id");
CREATE INDEX "incident_reports_reporter_id_idx" ON "incident_reports"("reporter_id");
CREATE INDEX "incident_reports_category_idx" ON "incident_reports"("category");
CREATE INDEX "incident_reports_severity_idx" ON "incident_reports"("severity");
CREATE INDEX "incident_reports_status_idx" ON "incident_reports"("status");
CREATE INDEX "incident_reports_created_at_idx" ON "incident_reports"("created_at");

ALTER TABLE "incident_reports"
ADD CONSTRAINT "incident_reports_booking_id_fkey"
FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "incident_reports"
ADD CONSTRAINT "incident_reports_trip_id_fkey"
FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "incident_reports"
ADD CONSTRAINT "incident_reports_post_trip_charge_id_fkey"
FOREIGN KEY ("post_trip_charge_id") REFERENCES "post_trip_charges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "incident_reports"
ADD CONSTRAINT "incident_reports_reporter_id_fkey"
FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "incident_reports"
ADD CONSTRAINT "incident_reports_reviewed_by_fkey"
FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
