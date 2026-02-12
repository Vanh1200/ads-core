import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
    datasources: {
        db: { url: process.env.DATABASE_URL }
    }
});

async function safeShift() {
    try {
        console.log('--- SAFE RELATIVE DATE SHIFT ---');

        const maxResult = await prisma.spendingRecord.aggregate({
            _max: { spendingDate: true }
        });

        const maxDate = maxResult._max.spendingDate;
        if (!maxDate) {
            console.log('No spending records found.');
            return;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const diffDays = Math.floor((today.getTime() - maxDate.getTime()) / (1000 * 60 * 60 * 24));
        console.log(`Current Max Date: ${maxDate.toISOString()}, Today: ${today.toISOString()}`);
        console.log(`Difference in days: ${diffDays}`);

        if (diffDays > 0) {
            // Step 1: Move all to far future to avoid temporary collisions
            console.log('Moving records to year 2050 (staging)...');
            await prisma.$executeRaw`
                UPDATE spending_records 
                SET spending_date = spending_date + interval '25 years',
                    period_start = period_start + interval '25 years',
                    period_end = period_end + interval '25 years'
            `;

            // Step 2: Move back to today's relative date
            console.log(`Moving records back with +${diffDays} days offset...`);
            await prisma.$executeRawUnsafe(`
                UPDATE spending_records 
                SET spending_date = spending_date - interval '25 years' + interval '${diffDays} days',
                    period_start = period_start - interval '25 years' + interval '${diffDays} days',
                    period_end = period_end - interval '25 years' + interval '${diffDays} days'
            `);

            console.log('Dates shifted successfully.');
        } else {
            console.log('No shift needed.');
        }

        // Always update totalSpending summaries
        console.log('Refreshing account summaries...');
        await prisma.$executeRaw`
            UPDATE accounts a
            SET total_spending = COALESCE((
                SELECT SUM(amount) 
                FROM spending_records s 
                WHERE s.account_id = a.id
            ), 0)
        `;

        const sample = await prisma.account.findFirst({
            where: { totalSpending: { gt: 0 } },
            select: { accountName: true, totalSpending: true }
        });
        console.log('Final Verification Sample:', sample);

    } catch (e) {
        console.error('Safe shift failed:', e);
    } finally {
        await prisma.$disconnect();
    }
}

safeShift();
