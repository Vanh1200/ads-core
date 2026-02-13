import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function backup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(__dirname, '../../backups', timestamp);

    try {
        console.log(`--- STARTING DATABASE BACKUP TO JSON ---`);
        console.log(`Target Directory: ${backupDir}`);

        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        const tables = [
            'user',
            'partner',
            'accountBatch',
            'invoiceMCC',
            'customer',
            'account',
            'spendingRecord',
            'activityLog',
            'accountMIHistory',
            'accountMCHistory',
            'spendingSnapshot'
        ];

        for (const table of tables) {
            console.log(`Exporting ${table}...`);
            // @ts-ignore - dynamic access to prisma models
            const data = await prisma[table].findMany();
            const filePath = path.join(backupDir, `${table}.json`);
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
            console.log(`✅ Saved ${data.length} records to ${table}.json`);
        }

        console.log(`--- BACKUP COMPLETE ---`);
        console.log(`Location: ${backupDir}`);

    } catch (error) {
        console.error('Backup failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

backup();
