import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verify() {
    try {
        console.log('--- DB INTEGRITY CHECK ---');
        const counts = {
            users: await prisma.user.count(),
            partners: await prisma.partner.count(),
            batches: await prisma.accountBatch.count(),
            invoices: await prisma.invoiceMCC.count(),
            customers: await prisma.customer.count(),
            accounts: await prisma.account.count(),
            spending: await prisma.spendingRecord.count(),
        };

        console.table(counts);

        // Check a sample spend
        const latestSpend = await prisma.spendingRecord.findFirst({
            orderBy: { createdAt: 'desc' },
            include: { account: true }
        });
        console.log('Sample Spend Record:', latestSpend);

    } catch (error) {
        console.error('Verification failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

verify();
