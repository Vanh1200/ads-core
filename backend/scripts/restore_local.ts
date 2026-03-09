import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function restore() {
    // Attempt to parse the directory from args or provide a default fallback
    const backupsDir = path.join(__dirname, '../../backups');
    if (!fs.existsSync(backupsDir)) {
        console.error('No backups directory found.');
        return;
    }

    const folders = fs.readdirSync(backupsDir).filter(f => {
        return fs.statSync(path.join(backupsDir, f)).isDirectory();
    });

    if (folders.length === 0) {
        console.error('No backup folders found.');
        return;
    }

    // sort to get the latest folder
    folders.sort();
    const latestBackupDir = path.join(backupsDir, folders[folders.length - 1]);
    const targetDir = process.argv[2] ? path.resolve(process.argv[2]) : latestBackupDir;

    if (!fs.existsSync(targetDir)) {
        console.error(`Directory not found: ${targetDir}`);
        return;
    }

    try {
        console.log(`--- STARTING DATABASE RESTORE FROM JSON ---`);
        console.log(`Source Directory: ${targetDir}`);

        // Reverse dependency order for safe deletion
        const deleteTables = [
            'activityLog',
            'spendingRecord',
            'spendingSnapshot',
            'accountMCHistory',
            'accountMIHistory',
            'account',
            'customer',
            'invoiceMCC',
            'accountBatch',
            'partner',
            'user'
        ];

        console.log('--- CLEANING EXISTING DATA ---');
        for (const table of deleteTables) {
            console.log(`Deleting existing ${table}...`);
            // @ts-ignore
            await prisma[table].deleteMany({});
            console.log(`✅ Cleared ${table}`);
        }

        // Ordered by dependency flow for safe insertion
        const insertTables = [
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

        console.log('--- RESTORING DATA ---');
        for (const table of insertTables) {
            const filePath = path.join(targetDir, `${table}.json`);
            if (!fs.existsSync(filePath)) {
                console.warn(`⚠️ Warning: ${table}.json not found. Skipping.`);
                continue;
            }

            console.log(`Importing ${table}...`);
            const fileData = fs.readFileSync(filePath, 'utf-8');
            let data = JSON.parse(fileData);

            if (table === 'account') {
                data = data.map((item: any) => {
                    if (item.status === 'SUSPENDED') item.status = 'INACTIVE';
                    return item;
                });
            }

            if (data && data.length > 0) {
                // We shouldn't use `createMany` broadly since there might be overlapping unique keys if the schema does not support it
                // and timestamps or other types might need to be created similarly, but Prisma's createMany handles arrays neatly.
                // NOTE: 'createMany' might not bypass relational checks for some id types. In PostgreSQL with UUIDs provided it is mostly fine.
                // @ts-ignore
                const result = await prisma[table].createMany({
                    data,
                    skipDuplicates: true
                });
                console.log(`✅ Restored ${result.count} records to ${table}`);
            } else {
                console.log(`ℹ️ No records found in ${table}.json`);
            }
        }

        console.log(`--- RESTORE COMPLETE ---`);
    } catch (error) {
        console.error('Restore failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

restore();
