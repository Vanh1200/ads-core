import prisma from './prisma';

/**
 * Manual database synchronization to handle schema drift in production
 * without being blocked by Prisma's migration registry (P3005 error).
 */
export async function syncDatabase() {
    console.log('🔄 Starting manual database synchronization...');

    try {
        // 1. Ensure AccountStatus and BatchStatus enums have INACTIVE variant
        // Note: PostgreSQL doesn't support 'IF NOT EXISTS' for ADD VALUE, 
        // but we can check the existence first.
        const checkEnumVariant = async (typeName: string, variant: string) => {
            const result = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(`
                SELECT EXISTS (
                    SELECT 1 FROM pg_type t 
                    JOIN pg_enum e ON t.oid = e.enumtypid 
                    WHERE t.typname = '${typeName}' AND e.enumlabel = '${variant}'
                ) as exists;
            `);
            return result[0].exists;
        };

        if (!(await checkEnumVariant('AccountStatus', 'INACTIVE'))) {
            console.log('➕ Adding INACTIVE to AccountStatus enum...');
            await prisma.$executeRawUnsafe('ALTER TYPE "AccountStatus" ADD VALUE \'INACTIVE\';');
        }

        if (!(await checkEnumVariant('BatchStatus', 'INACTIVE'))) {
            console.log('➕ Adding INACTIVE to BatchStatus enum...');
            await prisma.$executeRawUnsafe('ALTER TYPE "BatchStatus" ADD VALUE \'INACTIVE\';');
        }

        // 2. Update legacy SUSPENDED and DIED data to INACTIVE
        console.log('🧹 Migrating legacy SUSPENDED/DIED statuses to INACTIVE...');
        await prisma.$executeRawUnsafe('UPDATE accounts SET status = \'INACTIVE\' WHERE status::text IN (\'SUSPENDED\', \'DIED\');');
        await prisma.$executeRawUnsafe('UPDATE account_batches SET status = \'INACTIVE\' WHERE status::text IN (\'SUSPENDED\', \'DIED\');');

        // 3. Add missing columns to account_batches
        const addColumnIfMissing = async (tableName: string, columnName: string, columnDef: string) => {
            const result = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(`
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = '${tableName}' AND column_name = '${columnName}'
                ) as exists;
            `);

            if (!result[0].exists) {
                console.log(`➕ Adding column ${columnName} to ${tableName}...`);
                await prisma.$executeRawUnsafe(`ALTER TABLE "${tableName}" ADD COLUMN "${columnName}" ${columnDef};`);
            }
        };

        await addColumnIfMissing('account_batches', 'is_mix_year', 'BOOLEAN NOT NULL DEFAULT false');
        await addColumnIfMissing('account_batches', 'year', 'INTEGER');
        await addColumnIfMissing('account_batches', 'readiness', 'INTEGER NOT NULL DEFAULT 0');

        // 4. Ensure unique indexes from recent migrations exist
        // uniqueness check is handled by PostgreSQL during CREATE UNIQUE INDEX IF NOT EXISTS (if supported) 
        // or we check manually.
        const addIndexIfMissing = async (indexName: string, sql: string) => {
            const result = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(`
                SELECT EXISTS (
                    SELECT 1 FROM pg_indexes 
                    WHERE indexname = '${indexName}'
                ) as exists;
            `);

            if (!result[0].exists) {
                console.log(`➕ Creating index ${indexName}...`);
                await prisma.$executeRawUnsafe(sql);
            }
        };

        await addIndexIfMissing('account_batches_mcc_account_id_key',
            'CREATE UNIQUE INDEX "account_batches_mcc_account_id_key" ON "account_batches"("mcc_account_id");');

        await addIndexIfMissing('spending_records_account_id_spending_date_key',
            'CREATE UNIQUE INDEX "spending_records_account_id_spending_date_key" ON "spending_records"("account_id", "spending_date");');

        console.log('✅ Manual database synchronization completed successfully.');
    } catch (error) {
        console.error('❌ Manual database synchronization failed:', error);
        // We don't exit process here because the app might still be partially functional
        // and throwing might trigger a restart loop.
    }
}
