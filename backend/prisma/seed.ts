import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding database...');

    // Create admin user
    const adminPassword = await bcrypt.hash('admin123', 10);
    const admin = await prisma.user.upsert({
        where: { email: 'admin@aasystem.local' },
        update: {},
        create: {
            email: 'admin@aasystem.local',
            passwordHash: adminPassword,
            fullName: 'System Admin',
            role: 'ADMIN',
        },
    });
    console.log('✅ Admin user created:', admin.email);

    // Create sample users for each role
    const roles = ['MANAGER', 'BUYER', 'LINKER', 'ASSIGNER', 'UPDATER', 'VIEWER'] as const;
    for (const role of roles) {
        const password = await bcrypt.hash('password123', 10);
        await prisma.user.upsert({
            where: { email: `${role.toLowerCase()}@aasystem.local` },
            update: {},
            create: {
                email: `${role.toLowerCase()}@aasystem.local`,
                passwordHash: password,
                fullName: `${role.charAt(0) + role.slice(1).toLowerCase()} User`,
                role: role,
            },
        });
    }
    console.log('✅ Sample users created');

    // Create sample partner
    const partner = await prisma.partner.upsert({
        where: { id: '00000000-0000-0000-0000-000000000001' },
        update: {},
        create: {
            id: '00000000-0000-0000-0000-000000000001',
            name: 'Sample Partner',
            contactInfo: 'contact@partner.com',
            type: 'BOTH',
            notes: 'Sample partner for testing',
        },
    });
    console.log('✅ Sample partner created:', partner.name);

    // Create sample batch (MA)
    const batch = await prisma.accountBatch.upsert({
        where: { id: '00000000-0000-0000-0000-000000000002' },
        update: {},
        create: {
            id: '00000000-0000-0000-0000-000000000002',
            mccAccountName: '50-3 2025 22.1 (2)',
            mccAccountId: '487-677-5723',
            partnerId: partner.id,
            createdById: admin.id,
            status: 'ACTIVE',
        },
    });
    console.log('✅ Sample batch created:', batch.mccAccountName);

    // Create sample Invoice MCC (MI)
    const invoiceMCC = await prisma.invoiceMCC.upsert({
        where: { mccInvoiceId: '264-301-9762' },
        update: {},
        create: {
            name: 'Invoice MCC 001',
            mccInvoiceId: '264-301-9762',
            partnerId: partner.id,
            createdById: admin.id,
            status: 'ACTIVE',
            creditStatus: 'CONNECTED',
        },
    });
    console.log('✅ Sample Invoice MCC created:', invoiceMCC.name);

    // Create sample customer (MC)
    const customer = await prisma.customer.upsert({
        where: { name: '@sample_customer' },
        update: {},
        create: {
            name: '@sample_customer',
            contactInfo: 'customer@example.com',
            assignedStaffId: admin.id,
            status: 'ACTIVE',
        },
    });
    console.log('✅ Sample customer created:', customer.name);

    // Create sample accounts
    const sampleAccounts = [
        { googleAccountId: '239-459-6556', accountName: 'NAM', currency: 'USD' },
        { googleAccountId: '459-145-5044', accountName: 'XOY0122 -3luluku', currency: 'USD' },
        { googleAccountId: '512-240-5352', accountName: 'XOY0122 -3luluku', currency: 'USD' },
    ];

    for (const acc of sampleAccounts) {
        await prisma.account.upsert({
            where: { googleAccountId: acc.googleAccountId },
            update: {},
            create: {
                ...acc,
                batchId: batch.id,
                mccAccountName: batch.mccAccountName,
                mccAccountId: batch.mccAccountId,
                currentMiId: invoiceMCC.id,
                currentMcId: customer.id,
                status: 'ACTIVE',
            },
        });
    }
    console.log('✅ Sample accounts created:', sampleAccounts.length);

    // Create MI history for accounts
    const accounts = await prisma.account.findMany({ where: { batchId: batch.id } });
    for (const account of accounts) {
        await prisma.accountMIHistory.upsert({
            where: { id: `mi-history-${account.id}` },
            update: {},
            create: {
                id: `mi-history-${account.id}`,
                accountId: account.id,
                invoiceMccId: invoiceMCC.id,
                linkedAt: new Date(),
                linkedById: admin.id,
                reason: 'INITIAL',
            },
        });
        await prisma.accountMCHistory.upsert({
            where: { id: `mc-history-${account.id}` },
            update: {},
            create: {
                id: `mc-history-${account.id}`,
                accountId: account.id,
                customerId: customer.id,
                assignedAt: new Date(),
                assignedById: admin.id,
                reason: 'INITIAL',
            },
        });
    }
    console.log('✅ Account histories created');

    // Update counts
    await prisma.accountBatch.update({
        where: { id: batch.id },
        data: { totalAccounts: accounts.length, liveAccounts: accounts.length },
    });
    await prisma.invoiceMCC.update({
        where: { id: invoiceMCC.id },
        data: { linkedAccountsCount: accounts.length, activeAccountsCount: accounts.length },
    });
    await prisma.customer.update({
        where: { id: customer.id },
        data: { totalAccounts: accounts.length, activeAccounts: accounts.length },
    });

    console.log('🎉 Database seeded successfully!');
    console.log('\n📋 Login credentials:');
    console.log('   Admin: admin@aasystem.local / admin123');
    console.log('   Other roles: {role}@aasystem.local / password123');
}

main()
    .catch((e) => {
        console.error('❌ Seed error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
