-- Device hashes are now calculated only by Ads Core. Browser clients send a
-- device context plus an ECDSA challenge proof; they never submit a hash.
ALTER TABLE "xoy_devices" RENAME COLUMN "fingerprint" TO "device_hash";
ALTER TABLE "xoy_devices" RENAME COLUMN "fingerprint_signals" TO "device_context";
ALTER TABLE "xoy_device_sessions" ADD COLUMN "public_key" JSONB;
ALTER TABLE "xoy_device_sessions" ADD COLUMN "public_key_hash" TEXT;
-- Legacy records were authenticated only by client-provided hashes. They
-- cannot prove ownership under the new protocol, so release their slots once.
UPDATE "xoy_devices" SET "status" = 'INACTIVE' WHERE NOT EXISTS (
  SELECT 1 FROM "xoy_device_sessions" WHERE "xoy_device_sessions"."device_id" = "xoy_devices"."id" AND "public_key" IS NOT NULL
);
DROP INDEX IF EXISTS "xoy_devices_license_id_fingerprint_key";
CREATE UNIQUE INDEX "xoy_devices_license_id_device_hash_key" ON "xoy_devices"("license_id", "device_hash");

CREATE TABLE "xoy_device_challenges" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "license_id" TEXT NOT NULL,
  "session_id" TEXT,
  "purpose" TEXT NOT NULL,
  "installation_id" TEXT NOT NULL,
  "nonce_hash" TEXT NOT NULL,
  "device_hash" TEXT NOT NULL,
  "device_context" JSONB NOT NULL,
  "public_key" JSONB NOT NULL,
  "public_key_hash" TEXT NOT NULL,
  "extension_metadata" JSONB,
  "user_agent" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "xoy_device_challenges_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "xoy_licenses"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "xoy_device_challenges_nonce_hash_key" ON "xoy_device_challenges"("nonce_hash");
CREATE INDEX "xoy_device_challenges_license_id_expires_at_idx" ON "xoy_device_challenges"("license_id", "expires_at");

CREATE TABLE "xoy_device_audits" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "license_id" TEXT NOT NULL,
  "device_id" TEXT,
  "event_type" TEXT NOT NULL,
  "details" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "xoy_device_audits_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "xoy_licenses"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "xoy_device_audits_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "xoy_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "xoy_device_audits_license_id_created_at_idx" ON "xoy_device_audits"("license_id", "created_at");
CREATE INDEX "xoy_device_audits_device_id_created_at_idx" ON "xoy_device_audits"("device_id", "created_at");
