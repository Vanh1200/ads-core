-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'BUYER', 'LINKER', 'ASSIGNER', 'UPDATER', 'VIEWER');

-- CreateEnum
CREATE TYPE "PartnerType" AS ENUM ('ACCOUNT_SUPPLIER', 'INVOICE_PROVIDER', 'BOTH');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DIED');

-- CreateEnum
CREATE TYPE "InvoiceMCCStatus" AS ENUM ('ACTIVE', 'PENDING', 'EXHAUSTED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CreditStatus" AS ENUM ('PENDING', 'CONNECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DIED');

-- CreateEnum
CREATE TYPE "HistoryReason" AS ENUM ('INITIAL', 'MIGRATION', 'DIED', 'CREDIT_EXHAUSTED', 'REASSIGN', 'CUSTOMER_INACTIVE', 'ACCOUNT_DIED');

-- CreateEnum
CREATE TYPE "SnapshotType" AS ENUM ('MI_CHANGE', 'MC_CHANGE', 'DAILY_FINAL');

-- CreateEnum
CREATE TYPE "ActivityAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LINK_MI', 'UNLINK_MI', 'ASSIGN_MC', 'UNASSIGN_MC', 'SNAPSHOT', 'IMPORT', 'SYNC');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partners" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_info" TEXT,
    "type" "PartnerType" NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_batches" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mcc_account_name" TEXT,
    "mcc_account_id" TEXT,
    "is_prelinked" BOOLEAN NOT NULL DEFAULT false,
    "status" "BatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "total_accounts" INTEGER NOT NULL DEFAULT 0,
    "live_accounts" INTEGER NOT NULL DEFAULT 0,
    "died_accounts" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "partner_id" TEXT,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "account_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_mccs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mcc_invoice_id" TEXT NOT NULL,
    "status" "InvoiceMCCStatus" NOT NULL DEFAULT 'PENDING',
    "credit_status" "CreditStatus" NOT NULL DEFAULT 'PENDING',
    "linked_accounts_count" INTEGER NOT NULL DEFAULT 0,
    "active_accounts_count" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "partner_id" TEXT,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "invoice_mccs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_info" TEXT,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "total_spending" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_accounts" INTEGER NOT NULL DEFAULT 0,
    "active_accounts" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "assigned_staff_id" TEXT,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "google_account_id" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "timezone" TEXT,
    "mcc_account_name" TEXT,
    "mcc_account_id" TEXT,
    "total_spending" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "last_synced" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "batch_id" TEXT NOT NULL,
    "current_mi_id" TEXT,
    "current_mc_id" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_mi_histories" (
    "id" TEXT NOT NULL,
    "linked_at" TIMESTAMP(3) NOT NULL,
    "unlinked_at" TIMESTAMP(3),
    "reason" "HistoryReason" NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "account_id" TEXT NOT NULL,
    "invoice_mcc_id" TEXT NOT NULL,
    "linked_by" TEXT NOT NULL,
    "unlinked_by" TEXT,

    CONSTRAINT "account_mi_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_mc_histories" (
    "id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL,
    "unassigned_at" TIMESTAMP(3),
    "reason" "HistoryReason" NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "account_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "assigned_by" TEXT NOT NULL,
    "unassigned_by" TEXT,

    CONSTRAINT "account_mc_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spending_snapshots" (
    "id" TEXT NOT NULL,
    "spending_date" DATE NOT NULL,
    "cumulative_amount" DECIMAL(15,2) NOT NULL,
    "snapshot_at" TIMESTAMP(3) NOT NULL,
    "snapshot_type" "SnapshotType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "account_id" TEXT NOT NULL,
    "invoice_mcc_id" TEXT,
    "customer_id" TEXT,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "spending_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spending_records" (
    "id" TEXT NOT NULL,
    "spending_date" DATE NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "account_id" TEXT NOT NULL,
    "invoice_mcc_id" TEXT,
    "customer_id" TEXT,

    CONSTRAINT "spending_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "action" "ActivityAction" NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "old_values" JSONB,
    "new_values" JSONB,
    "description" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_mccs_mcc_invoice_id_key" ON "invoice_mccs"("mcc_invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_name_key" ON "customers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_google_account_id_key" ON "accounts"("google_account_id");

-- AddForeignKey
ALTER TABLE "account_batches" ADD CONSTRAINT "account_batches_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_batches" ADD CONSTRAINT "account_batches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_mccs" ADD CONSTRAINT "invoice_mccs_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_mccs" ADD CONSTRAINT "invoice_mccs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_assigned_staff_id_fkey" FOREIGN KEY ("assigned_staff_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "account_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_current_mi_id_fkey" FOREIGN KEY ("current_mi_id") REFERENCES "invoice_mccs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_current_mc_id_fkey" FOREIGN KEY ("current_mc_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_mi_histories" ADD CONSTRAINT "account_mi_histories_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_mi_histories" ADD CONSTRAINT "account_mi_histories_invoice_mcc_id_fkey" FOREIGN KEY ("invoice_mcc_id") REFERENCES "invoice_mccs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_mi_histories" ADD CONSTRAINT "account_mi_histories_linked_by_fkey" FOREIGN KEY ("linked_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_mi_histories" ADD CONSTRAINT "account_mi_histories_unlinked_by_fkey" FOREIGN KEY ("unlinked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_mc_histories" ADD CONSTRAINT "account_mc_histories_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_mc_histories" ADD CONSTRAINT "account_mc_histories_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_mc_histories" ADD CONSTRAINT "account_mc_histories_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_mc_histories" ADD CONSTRAINT "account_mc_histories_unassigned_by_fkey" FOREIGN KEY ("unassigned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spending_snapshots" ADD CONSTRAINT "spending_snapshots_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spending_snapshots" ADD CONSTRAINT "spending_snapshots_invoice_mcc_id_fkey" FOREIGN KEY ("invoice_mcc_id") REFERENCES "invoice_mccs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spending_snapshots" ADD CONSTRAINT "spending_snapshots_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spending_snapshots" ADD CONSTRAINT "spending_snapshots_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spending_records" ADD CONSTRAINT "spending_records_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spending_records" ADD CONSTRAINT "spending_records_invoice_mcc_id_fkey" FOREIGN KEY ("invoice_mcc_id") REFERENCES "invoice_mccs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spending_records" ADD CONSTRAINT "spending_records_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
