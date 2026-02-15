-- Add INACTIVE to enums if not present
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'AccountStatus' AND e.enumlabel = 'INACTIVE') THEN
        ALTER TYPE "AccountStatus" ADD VALUE 'INACTIVE';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'BatchStatus' AND e.enumlabel = 'INACTIVE') THEN
        ALTER TYPE "BatchStatus" ADD VALUE 'INACTIVE';
    END IF;
END $$;

-- Update data to INACTIVE
UPDATE "accounts" SET "status" = 'INACTIVE' WHERE "status"::text IN ('SUSPENDED', 'DIED');
UPDATE "account_batches" SET "status" = 'INACTIVE' WHERE "status"::text IN ('SUSPENDED', 'DIED');

-- AlterTable account_batches
-- Safe check for columns
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'account_batches' AND column_name = 'is_mix_year') THEN
        ALTER TABLE "account_batches" ADD COLUMN "is_mix_year" BOOLEAN NOT NULL DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'account_batches' AND column_name = 'readiness') THEN
        ALTER TABLE "account_batches" ADD COLUMN "readiness" INTEGER NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'account_batches' AND column_name = 'year') THEN
        ALTER TABLE "account_batches" ADD COLUMN "year" INTEGER;
    END IF;
    -- Remove name column if it exists and is not needed (based on schema)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'account_batches' AND column_name = 'name') THEN
        ALTER TABLE "account_batches" ALTER COLUMN "name" DROP NOT NULL; -- Or drop it if you are sure
    END IF;
END $$;
