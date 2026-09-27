CREATE TYPE "XoyLicenseStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED');
CREATE TYPE "XoyDeviceStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'REVOKED');

CREATE TABLE "xoy_licenses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "manager_email" TEXT NOT NULL,
    "manager_password_hash" TEXT NOT NULL,
    "max_devices" INTEGER NOT NULL DEFAULT 3,
    "status" "XoyLicenseStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "xoy_licenses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "xoy_devices" (
    "id" TEXT NOT NULL,
    "license_id" TEXT NOT NULL,
    "installation_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL DEFAULT 'Chrome profile',
    "extension_version" TEXT,
    "status" "XoyDeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "refresh_token_hash" TEXT,
    "refresh_expires_at" TIMESTAMP(3),
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    CONSTRAINT "xoy_devices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "xoy_licenses_key_prefix_key" ON "xoy_licenses"("key_prefix");
CREATE UNIQUE INDEX "xoy_licenses_key_hash_key" ON "xoy_licenses"("key_hash");
CREATE UNIQUE INDEX "xoy_licenses_manager_email_key" ON "xoy_licenses"("manager_email");
CREATE UNIQUE INDEX "xoy_devices_license_id_installation_id_key" ON "xoy_devices"("license_id", "installation_id");
CREATE INDEX "xoy_devices_license_id_status_last_seen_at_idx" ON "xoy_devices"("license_id", "status", "last_seen_at");
ALTER TABLE "xoy_devices" ADD CONSTRAINT "xoy_devices_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "xoy_licenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
