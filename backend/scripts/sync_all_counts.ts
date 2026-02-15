import prisma from '../src/infrastructure/database/prisma';
import { invoiceMCCRepository } from '../src/infrastructure/database/repositories/PrismaInvoiceMCCRepository';
import { customerRepository } from '../src/infrastructure/database/repositories/PrismaCustomerRepository';

async function syncAll() {
    try {
        console.log('--- STARTING GLOBAL COUNT SYNCHRONIZATION ---');

        // Sync all Invoice MCCs
        const mis = await prisma.invoiceMCC.findMany({ select: { id: true, name: true } });
        console.log(`Found ${mis.length} Invoice MCCs. Syncing counts...`);
        for (const mi of mis) {
            await invoiceMCCRepository.syncCounts(mi.id);
            console.log(`✅ Synced MI: ${mi.name}`);
        }

        // Sync all Customers
        const mcs = await prisma.customer.findMany({ select: { id: true, name: true } });
        console.log(`Found ${mcs.length} Customers. Syncing counts...`);
        for (const mc of mcs) {
            await customerRepository.syncCounts(mc.id);
            console.log(`✅ Synced MC: ${mc.name}`);
        }

        console.log('--- SYNCHRONIZATION COMPLETE ---');
    } catch (error) {
        console.error('Synchronization failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

syncAll();
