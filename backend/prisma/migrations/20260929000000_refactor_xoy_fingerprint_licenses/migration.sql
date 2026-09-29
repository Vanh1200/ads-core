ALTER TYPE "XoyLicenseStatus" ADD VALUE IF NOT EXISTS 'ISSUED';
DO $$ BEGIN
    CREATE TYPE "XoyLicensePlan" AS ENUM ('BASIC', 'FULL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "xoy_licenses" ADD COLUMN IF NOT EXISTS "telegram_id" TEXT;
ALTER TABLE "xoy_licenses" ADD COLUMN IF NOT EXISTS "key_encrypted" TEXT;
ALTER TABLE "xoy_licenses" ADD COLUMN IF NOT EXISTS "plan" "XoyLicensePlan" NOT NULL DEFAULT 'FULL';
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'xoy_licenses' AND column_name = 'max_devices')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'xoy_licenses' AND column_name = 'max_fingerprints') THEN
        ALTER TABLE "xoy_licenses" RENAME COLUMN "max_devices" TO "max_fingerprints";
    END IF;
END $$;
ALTER TABLE "xoy_licenses" DROP CONSTRAINT IF EXISTS "xoy_licenses_manager_email_key";
DROP INDEX IF EXISTS "xoy_licenses_manager_email_key";
ALTER TABLE "xoy_licenses" DROP COLUMN IF EXISTS "manager_email";
ALTER TABLE "xoy_licenses" DROP COLUMN IF EXISTS "manager_password_hash";

ALTER TABLE "xoy_devices" ADD COLUMN IF NOT EXISTS "fingerprint" TEXT;
ALTER TABLE "xoy_devices" ADD COLUMN IF NOT EXISTS "fingerprint_signals" JSONB;
ALTER TABLE "xoy_devices" ADD COLUMN IF NOT EXISTS "extension_metadata" JSONB;
ALTER TABLE "xoy_devices" ADD COLUMN IF NOT EXISTS "user_agent" TEXT;

CREATE TABLE IF NOT EXISTS "xoy_device_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "device_id" TEXT NOT NULL,
    "installation_id" TEXT NOT NULL,
    "refresh_token_hash" TEXT,
    "refresh_expires_at" TIMESTAMP(3),
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    CONSTRAINT "xoy_device_sessions_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "xoy_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "xoy_device_sessions_installation_id_key" ON "xoy_device_sessions"("installation_id");

INSERT INTO "xoy_device_sessions" ("id", "device_id", "installation_id", "refresh_token_hash", "refresh_expires_at", "first_seen_at", "last_seen_at", "revoked_at")
SELECT md5('xoy-session:' || "id"), "id", "installation_id", "refresh_token_hash", "refresh_expires_at", "first_seen_at", "last_seen_at", "revoked_at"
FROM "xoy_devices"
WHERE "installation_id" IS NOT NULL
ON CONFLICT ("installation_id") DO NOTHING;

UPDATE "xoy_devices" SET "fingerprint" = 'legacy:' || "id" WHERE "fingerprint" IS NULL;
ALTER TABLE "xoy_devices" ALTER COLUMN "fingerprint" SET NOT NULL;
ALTER TABLE "xoy_devices" DROP CONSTRAINT IF EXISTS "xoy_devices_license_id_installation_id_key";
DROP INDEX IF EXISTS "xoy_devices_license_id_installation_id_key";
ALTER TABLE "xoy_devices" DROP COLUMN IF EXISTS "installation_id";
ALTER TABLE "xoy_devices" DROP COLUMN IF EXISTS "display_name";
ALTER TABLE "xoy_devices" DROP COLUMN IF EXISTS "extension_version";
ALTER TABLE "xoy_devices" DROP COLUMN IF EXISTS "refresh_token_hash";
ALTER TABLE "xoy_devices" DROP COLUMN IF EXISTS "refresh_expires_at";

CREATE UNIQUE INDEX IF NOT EXISTS "xoy_devices_license_id_fingerprint_key" ON "xoy_devices"("license_id", "fingerprint");
CREATE INDEX IF NOT EXISTS "xoy_device_sessions_device_id_last_seen_at_idx" ON "xoy_device_sessions"("device_id", "last_seen_at");
