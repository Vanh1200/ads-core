/*
  Warnings:

  - The values [DIED] on the enum `AccountStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [DIED] on the enum `BatchStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [DIED,ACCOUNT_DIED] on the enum `HistoryReason` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `died_accounts` on the `account_batches` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `account_batches` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "AccountStatus_new" AS ENUM ('ACTIVE', 'INACTIVE');
ALTER TABLE "accounts" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "accounts" ALTER COLUMN "status" TYPE "AccountStatus_new" USING ("status"::text::"AccountStatus_new");
ALTER TYPE "AccountStatus" RENAME TO "AccountStatus_old";
ALTER TYPE "AccountStatus_new" RENAME TO "AccountStatus";
DROP TYPE "AccountStatus_old";
ALTER TABLE "accounts" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
COMMIT;

-- AlterEnum
ALTER TYPE "ActivityAction" ADD VALUE 'IMPORT_SPENDING';

-- AlterEnum
BEGIN;
CREATE TYPE "BatchStatus_new" AS ENUM ('ACTIVE', 'INACTIVE');
ALTER TABLE "account_batches" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "account_batches" ALTER COLUMN "status" TYPE "BatchStatus_new" USING ("status"::text::"BatchStatus_new");
ALTER TYPE "BatchStatus" RENAME TO "BatchStatus_old";
ALTER TYPE "BatchStatus_new" RENAME TO "BatchStatus";
DROP TYPE "BatchStatus_old";
ALTER TABLE "account_batches" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "HistoryReason_new" AS ENUM ('INITIAL', 'MIGRATION', 'CREDIT_EXHAUSTED', 'REASSIGN', 'CUSTOMER_INACTIVE');
ALTER TABLE "account_mi_histories" ALTER COLUMN "reason" TYPE "HistoryReason_new" USING ("reason"::text::"HistoryReason_new");
ALTER TABLE "account_mc_histories" ALTER COLUMN "reason" TYPE "HistoryReason_new" USING ("reason"::text::"HistoryReason_new");
ALTER TYPE "HistoryReason" RENAME TO "HistoryReason_old";
ALTER TYPE "HistoryReason_new" RENAME TO "HistoryReason";
DROP TYPE "HistoryReason_old";
COMMIT;

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'MANAGER';

-- AlterTable
ALTER TABLE "account_batches" DROP COLUMN "died_accounts",
DROP COLUMN "name",
ADD COLUMN     "readiness" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "timezone" TEXT,
ADD COLUMN     "year" INTEGER;
