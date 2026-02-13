import * as XLSX from 'xlsx';
import { accountRepository } from '../../infrastructure/database/repositories/PrismaAccountRepository';
import { batchRepository } from '../../infrastructure/database/repositories/PrismaBatchRepository';
import { spendingRepository } from '../../infrastructure/database/repositories/PrismaSpendingRepository';
import { spendingSnapshotRepository } from '../../infrastructure/database/repositories/PrismaSpendingSnapshotRepository';
import { spendingService } from './SpendingService';
import { logActivity } from '../../infrastructure/logging/ActivityLogger';
import prisma from '../../infrastructure/database/prisma';

export class ImportService {
    async parseBatch(buffer: Buffer) {
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 }) as any[][];

        if (rows.length < 2) throw new Error('BAD_REQUEST: File is empty or has no header');

        const headers = rows[0].map(h => String(h).trim().toLowerCase());
        const dataRows = rows.slice(1);

        const accounts = dataRows.map(row => {
            const acc: any = {};
            headers.forEach((h, i) => {
                if (h.includes('name')) acc.accountName = row[i];
                if (h.includes('id')) acc.googleAccountId = String(row[i]);
                if (h.includes('currency')) acc.currency = row[i];
                if (h.includes('status')) {
                    const status = String(row[i]).toUpperCase();
                    acc.status = (status === 'ACTIVE' || status === 'HOẠT ĐỘNG') ? 'ACTIVE' : 'INACTIVE';
                }
            });
            return acc;
        }).filter(a => a.googleAccountId);

        const accountsWithFlags = [];
        for (const acc of accounts) {
            const existing = await accountRepository.findByGoogleId(acc.googleAccountId);
            accountsWithFlags.push({
                ...acc,
                existsInDb: !!existing
            });
        }

        return {
            accounts: accountsWithFlags,
            summary: {
                total: accountsWithFlags.length,
                new: accountsWithFlags.filter(a => !a.existsInDb).length,
                existing: accountsWithFlags.filter(a => a.existsInDb).length
            }
        };
    }

    async importAccounts(buffer: Buffer, batchId: string, userId: string, ipAddress?: string) {
        const { accounts: accountsData } = await this.parseBatch(buffer);
        const results = { created: 0, skipped: 0, errors: 0 };

        for (const data of accountsData) {
            try {
                const existing = await accountRepository.findByGoogleId(data.googleAccountId);
                if (existing) {
                    results.skipped++;
                    continue;
                }
                await accountRepository.create({
                    ...data,
                    batchId,
                    createdById: userId
                });
                results.created++;
            } catch (err) {
                results.errors++;
            }
        }

        await batchRepository.updateBatchCounts(batchId);
        await logActivity({
            userId,
            action: 'IMPORT',
            entityType: 'AccountBatch',
            entityId: batchId,
            description: `Imported ${results.created} accounts into batch.`,
            ipAddress
        });

        return { results };
    }

    async previewSpending(buffer: Buffer) {
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
        return data; // Simplified for now
    }

    async confirmSpending(data: any, userId: string, ipAddress?: string) {
        // Implementation logic for confirming spending, similar to ConfirmSpendingUseCase
        // We can use spendingService.createSnapshot and spendingService.calculateRecords here
        const results = { snapshots: 0, accountsAffected: new Set<string>() };

        await prisma.$transaction(async (tx) => {
            for (const item of data.records) {
                const snapshot = await spendingSnapshotRepository.create({
                    accountId: item.accountId,
                    cumulativeAmount: item.amount,
                    snapshotAt: new Date(data.spendingDate),
                    spendingDate: new Date(data.spendingDate),
                    snapshotType: 'DAILY_FINAL',
                    createdById: userId,
                    invoiceMccId: item.invoiceMccId,
                    customerId: item.customerId
                });
                results.snapshots++;
                results.accountsAffected.add(item.accountId);
            }
        });

        for (const accountId of results.accountsAffected) {
            await spendingService.calculateRecords(accountId, data.spendingDate);
        }

        await logActivity({
            userId,
            action: 'IMPORT_SPENDING',
            entityType: 'Spending',
            entityId: 'BULK',
            description: `Imported spending for ${results.accountsAffected.size} accounts.`,
            ipAddress
        });

        return { snapshotsCreated: results.snapshots, accountsAffected: results.accountsAffected.size };
    }
}

export const importService = new ImportService();
