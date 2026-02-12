import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
    try {
        const spends = await prisma.spendingRecord.findMany({
            take: 10,
            select: { spendingDate: true, amount: true }
        });
        console.log('Sample Spends:', spends);

        const totalAccounts = await prisma.account.count();
        const accountsWithZeroStoredSpending = await prisma.account.count({
            where: { totalSpending: 0 }
        });
        console.log(`Total Accounts: ${totalAccounts}, Accounts with 0 stored spending: ${accountsWithZeroStoredSpending}`);

        // Check if there are any non-zero spending records
        const recordsWithAmount = await prisma.spendingRecord.count({
            where: { amount: { gt: 0 } }
        });
        console.log(`Spending records with amount > 0: ${recordsWithAmount}`);

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

check();
