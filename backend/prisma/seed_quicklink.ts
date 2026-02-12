import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding QuickLink test data...');

    // Find admin user
    const admin = await prisma.user.findFirst({
        where: { role: 'ADMIN' },
    });

    if (!admin) {
        console.error('❌ Admin user not found. Please run the main seed script first.');
        process.exit(1);
    }

    // Create a partner
    const partnerId = '00000000-0000-0000-0000-000000000005';
    const partner = await prisma.partner.upsert({
        where: { id: partnerId },
        update: {},
        create: {
            id: partnerId,
            name: 'QuickLink Test Provider',
            type: 'INVOICE_PROVIDER',
        },
    });

    // Create test batches
    const batchesData = [
        { mccAccountName: 'USD -3 2026 1000', timezone: 'UTC-3', year: 2026, readiness: 10 },
        { mccAccountName: 'USD +8 2025 500', timezone: 'UTC+8', year: 2025, readiness: 8 },
        { mccAccountName: 'PHP +8 2025 300', timezone: 'UTC+8', year: 2025, readiness: 5 },
    ];

    for (const bData of batchesData) {
        const batch = await prisma.accountBatch.create({
            data: {
                mccAccountName: bData.mccAccountName,
                timezone: bData.timezone,
                year: bData.year,
                readiness: bData.readiness,
                status: 'ACTIVE',
                partnerId: partner.id,
                createdById: admin.id,
                totalAccounts: 20,
                liveAccounts: 20,
            },
        });

        // Create 20 available accounts for each batch
        const currency = bData.mccAccountName.startsWith('USD') ? 'USD' : 'PHP';
        for (let i = 1; i <= 20; i++) {
            await prisma.account.create({
                data: {
                    googleAccountId: `${Math.floor(Math.random() * 900 + 100)}-${Math.floor(Math.random() * 900 + 100)}-${Math.floor(Math.random() * 9000 + 1000)}`,
                    accountName: `Test Acc ${batch.mccAccountName} ${i}`,
                    currency: currency,
                    status: 'ACTIVE',
                    batchId: batch.id,
                },
            });
        }
        console.log(`✅ Created batch ${batch.mccAccountName} with 20 accounts`);
    }

    console.log('🎉 QuickLink test data seeded successfully!');
}

main()
    .catch((e) => {
        console.error('❌ Seed error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
