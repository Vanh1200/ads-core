import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Starting migration of status DIED to SUSPENDED...');

    // Update Accounts
    const accounts = await prisma.account.updateMany({
        where: { status: 'DIED' as any },
        data: { status: 'SUSPENDED' as any },
    });
    console.log(`Updated ${accounts.count} accounts.`);

    // Update Batches
    const batches = await prisma.accountBatch.updateMany({
        where: { status: 'DIED' as any },
        data: { status: 'INACTIVE' as any },
    });
    console.log(`Updated ${batches.count} batches.`);

    // Update MI Histories
    const miHistories = await prisma.accountMIHistory.updateMany({
        where: { reason: 'DIED' as any },
        data: { reason: 'CUSTOMER_INACTIVE' as any }, // Or a better default
    });
    console.log(`Updated ${miHistories.count} MI histories (reason: DIED).`);

    const miHistories2 = await prisma.accountMIHistory.updateMany({
        where: { reason: 'ACCOUNT_DIED' as any },
        data: { reason: 'CUSTOMER_INACTIVE' as any },
    });
    console.log(`Updated ${miHistories2.count} MI histories (reason: ACCOUNT_DIED).`);

    // Update MC Histories
    const mcHistories = await prisma.accountMCHistory.updateMany({
        where: { reason: 'DIED' as any },
        data: { reason: 'CUSTOMER_INACTIVE' as any },
    });
    console.log(`Updated ${mcHistories.count} MC histories (reason: DIED).`);

    const mcHistories2 = await prisma.accountMCHistory.updateMany({
        where: { reason: 'ACCOUNT_DIED' as any },
        data: { reason: 'CUSTOMER_INACTIVE' as any },
    });
    console.log(`Updated ${mcHistories2.count} MC histories (reason: ACCOUNT_DIED).`);

    console.log('Migration completed.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
