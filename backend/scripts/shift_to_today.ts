import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
    datasources: {
        db: { url: process.env.DATABASE_URL }
    }
});

async function relativeShift() {
    try {
        console.log('--- RELATIVE DATE SHIFT ---');

        // 1. Find max date
        const maxResult = await prisma.spendingRecord.aggregate({
            _max: { spendingDate: true }
        });

        const maxDate = maxResult._max.spendingDate;
        if (!maxDate) {
            console.log('No spending records found.');
            return;
        }

        console.log('Current Max Date:', maxDate);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const diffDays = Math.floor((today.getTime() - maxDate.getTime()) / (1000 * 60 * 60 * 24));
        console.log(`Difference in days: ${diffDays}`);

        if (diffDays > 0) {
            console.log(`Shifting all records by +${diffDays} days...`);
            const updateCount = await prisma.$executeRawUnsafe(`
                UPDATE spending_records 
                SET spending_date = spending_date + interval '${diffDays} days',
                    period_start = period_start + interval '${diffDays} days',
                    period_end = period_end + interval '${diffDays} days'
            `);
            console.log(`Shifted ${updateCount} records.`);
        } else {
            console.log('No shift needed (max date is today or in future).');
        }

        // 2. Refresh totalSpending logic just in case
        await prisma.$executeRaw`
            UPDATE accounts a
            SET total_spending = COALESCE((
                SELECT SUM(amount) 
                FROM spending_records s 
                WHERE s.account_id = a.id
            ), 0)
        `;

        console.log('--- SHIFT COMPLETE ---');

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

relativeShift();
