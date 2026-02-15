import * as XLSX from 'xlsx';
import { parseBatchExcel } from '../../infrastructure/parsers/excelParser';
import { accountRepository } from '../../infrastructure/database/repositories/PrismaAccountRepository';
import { batchRepository } from '../../infrastructure/database/repositories/PrismaBatchRepository';
import { spendingRepository } from '../../infrastructure/database/repositories/PrismaSpendingRepository';
import { spendingSnapshotRepository } from '../../infrastructure/database/repositories/PrismaSpendingSnapshotRepository';
import { spendingService } from './SpendingService';
import { logActivity } from '../../infrastructure/logging/ActivityLogger';
import prisma from '../../infrastructure/database/prisma';

export class ImportService {
    async parseBatch(buffer: Buffer) {
        const parsed = parseBatchExcel(buffer);

        const accountsWithFlags = [];
        for (const acc of parsed.accounts) {
            const existing = await accountRepository.findByGoogleId(acc.googleAccountId);
            accountsWithFlags.push({
                ...acc,
                existsInDb: !!existing
            });
        }

        return {
            accounts: accountsWithFlags,
            mccAccountName: parsed.batchName,
            mccAccountId: parsed.mccAccountId,
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
                    googleAccountId: data.googleAccountId,
                    accountName: data.accountName,
                    currency: data.currency || 'USD',
                    status: data.status,
                    batchId
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

    async createBatchWithAccounts(data: any, userId: string, ipAddress?: string) {
        const { mccAccountId, mccAccountName, timezone, year, readiness, accounts } = data;

        const batch = await prisma.accountBatch.create({
            data: {
                mccAccountId: mccAccountId || null,
                mccAccountName: mccAccountName || null,
                timezone: timezone || null,
                year: year ? parseInt(year.toString()) : null,
                isMixYear: data.isMixYear || false,
                readiness: readiness ? parseInt(readiness.toString()) : 0,
                status: 'ACTIVE',
                createdById: userId,
            }
        });

        const results = { created: 0, updated: 0, skipped: 0, errors: 0 };

        for (const account of accounts) {
            try {
                const { googleAccountId, accountName, status, currency } = account;
                if (!googleAccountId) { results.skipped++; continue; }

                const existing = await accountRepository.findByGoogleId(googleAccountId);

                if (existing) {
                    await accountRepository.update(existing.id, {
                        accountName,
                        status,
                        batchId: batch.id,
                        mccAccountName: mccAccountName || null,
                        mccAccountId: mccAccountId || null,
                    });
                    results.updated++;
                } else {
                    await accountRepository.create({
                        googleAccountId,
                        accountName,
                        status: status || 'ACTIVE',
                        currency: currency || 'USD',
                        batchId: batch.id,
                        mccAccountName: mccAccountName || null,
                        mccAccountId: mccAccountId || null,
                    });
                    results.created++;
                }
            } catch (err) {
                results.errors++;
            }
        }

        await batchRepository.updateBatchCounts(batch.id);

        await logActivity({
            userId,
            action: 'CREATE',
            entityType: 'AccountBatch',
            entityId: batch.id,
            newValues: { mccAccountName, accountsCreated: results.created, accountsUpdated: results.updated },
            description: `Tạo Lô "${mccAccountName}" với ${results.created + results.updated} tài khoản`,
            ipAddress
        });

        return {
            message: 'Batch created successfully',
            batch,
            results
        };
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
