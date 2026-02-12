import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
    try {
        console.log('--- FINAL COUNT VERIFICATION ---');

        const batches = await prisma.accountBatch.findMany({
            take: 3,
            select: { mccAccountName: true, totalAccounts: true, liveAccounts: true }
        });
        console.log('Batches:', JSON.stringify(batches, null, 2));

        const customers = await prisma.customer.findMany({
            take: 3,
            select: { name: true, totalAccounts: true, activeAccounts: true }
        });
        console.log('Customers:', JSON.stringify(customers, null, 2));

        // Correct field name check from schema view earlier:
        // Customer: total_accounts, active_accounts
        // AccountBatch: total_accounts, live_accounts
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

check();
