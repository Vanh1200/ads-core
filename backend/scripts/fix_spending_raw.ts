import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.DATABASE_URL
        }
    }
});

async function fix() {
    try {
        console.log('--- RAW SQL FIX STARTING ---');
        console.log('Database URL:', process.env.DATABASE_URL?.split('@')[1]); // Masked

        // 1. Update all spending dates to 2026 if they are 2025
        console.log('Shifting 2025 dates to 2026...');
        const dateUpdate = await prisma.$executeRaw`
            UPDATE spending_records 
            SET spending_date = spending_date + interval '1 year',
                period_start = period_start + interval '1 year',
                period_end = period_end + interval '1 year'
            WHERE EXTRACT(YEAR FROM spending_date) = 2025
        `;
        console.log(`Updated ${dateUpdate} spending records.`);

        // 2. Update total_spending in accounts
        console.log('Updating total_spending in accounts table...');
        const accountUpdate = await prisma.$executeRaw`
            UPDATE accounts a
            SET total_spending = COALESCE((
                SELECT SUM(amount) 
                FROM spending_records s 
                WHERE s.account_id = a.id
            ), 0)
        `;
        console.log(`Updated ${accountUpdate} accounts.`);

        // 3. Verification
        const sample = await prisma.account.findFirst({
            where: { totalSpending: { gt: 0 } },
            select: { accountName: true, totalSpending: true }
        });
        console.log('Verification Sample:', sample);

    } catch (e) {
        console.error('Fix failed:', e);
    } finally {
        await prisma.$disconnect();
    }
}

fix();
