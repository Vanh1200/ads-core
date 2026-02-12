import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
    datasources: {
        db: { url: process.env.DATABASE_URL }
    }
});

async function finalFix() {
    try {
        console.log('--- FINAL AGGREGATE FIX ---');

        // 1. Update total_spending in customers table
        const mcUpdate = await prisma.$executeRaw`
            UPDATE customers c
            SET total_spending = COALESCE((
                SELECT SUM(amount) 
                FROM spending_records s 
                WHERE s.customer_id = c.id
            ), 0)
        `;
        console.log(`Updated ${mcUpdate} customers.`);

        // 2. Final Check
        const totalSum = await prisma.spendingRecord.aggregate({
            _sum: { amount: true }
        });
        const accountSumSize = await prisma.account.aggregate({
            _sum: { totalSpending: true }
        });
        const customerSumSize = await prisma.customer.aggregate({
            _sum: { totalSpending: true }
        });

        console.log({
            totalInSpendRecords: totalSum._sum.amount,
            sumOfAccountTotals: accountSumSize._sum.totalSpending,
            sumOfCustomerTotals: customerSumSize._sum.totalSpending
        });

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

finalFix();
