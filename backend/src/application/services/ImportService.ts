
import { parseBatchExcel } from '../../infrastructure/parsers/excelParser';
import { accountRepository } from '../../infrastructure/database/repositories/PrismaAccountRepository';
import { batchRepository } from '../../infrastructure/database/repositories/PrismaBatchRepository';
import { spendingRepository } from '../../infrastructure/database/repositories/PrismaSpendingRepository';
import { spendingSnapshotRepository } from '../../infrastructure/database/repositories/PrismaSpendingSnapshotRepository';
import { invoiceMCCRepository } from '../../infrastructure/database/repositories/PrismaInvoiceMCCRepository';
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
                existsInDb: !!existing,
                existingBatchId: existing?.batchId || null
            });
        }

        let existingBatch = null;
        if (parsed.mccAccountId) {
            existingBatch = await prisma.accountBatch.findUnique({
                where: { mccAccountId: parsed.mccAccountId }
            });
        }

        return {
            accounts: accountsWithFlags,
            mccAccountName: existingBatch?.mccAccountName || parsed.batchName,
            mccAccountId: parsed.mccAccountId,
            existingBatch: !!existingBatch,
            existingBatchDetails: existingBatch ? {
                timezone: existingBatch.timezone,
                year: existingBatch.year,
                isMixYear: existingBatch.isMixYear,
                readiness: existingBatch.readiness,
                partnerId: existingBatch.partnerId
            } : null,
            summary: {
                total: accountsWithFlags.length,
                new: accountsWithFlags.filter(a => !a.existsInDb).length,
                existing: accountsWithFlags.filter(a => a.existsInDb).length
            }
        };
    }

    async parseInvoiceMCC(buffer: Buffer) {
        const parsed = parseBatchExcel(buffer);

        const accountsWithFlags = [];
        for (const acc of parsed.accounts) {
            const existing = await accountRepository.findByGoogleId(acc.googleAccountId);
            accountsWithFlags.push({
                ...acc,
                existsInDb: !!existing,
                existingMiId: existing?.currentMiId || null,
            });
        }
        
        const existingMi = await invoiceMCCRepository.findByMccId(parsed.mccAccountId);

        return {
            accounts: accountsWithFlags,
            miName: parsed.batchName, // Use manager name as MI name
            mccInvoiceId: parsed.mccAccountId, // Use manager ID as MI ID
            existingMi: !!existingMi,
            existingMiDetails: existingMi,
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

    async previewSpending(buffer: Buffer, spendingDate: string, miId?: string) {
        const parsed = parseBatchExcel(buffer);

        // Look up the batch by MCC Account ID
        let batch: any = null;
        if (parsed.mccAccountId) {
            batch = await prisma.accountBatch.findUnique({
                where: { mccAccountId: parsed.mccAccountId }
            });
        }

        // Look up MI if miId is provided
        let mi: any = null;
        if (miId) {
            mi = await prisma.invoiceMCC.findUnique({ where: { id: miId } });
        }

        const previewItems: any[] = [];
        let newAccountsCount = 0;
        let existingAccountsCount = 0;

        const targetDate = new Date(spendingDate + 'T00:00:00.000Z');

        for (const acc of parsed.accounts) {
            const existing = await accountRepository.findByGoogleId(acc.googleAccountId);

            // Check for existing spending on the target date
            let existingAmount: number | null = null;
            if (existing) {
                existingAccountsCount++;
                const existingSnapshots = await prisma.spendingSnapshot.findMany({
                    where: {
                        accountId: existing.id,
                        spendingDate: targetDate,
                    },
                    orderBy: { snapshotAt: 'desc' },
                    take: 1,
                });
                if (existingSnapshots.length > 0) {
                    existingAmount = Number(existingSnapshots[0].cumulativeAmount);
                }
            } else {
                newAccountsCount++;
            }

            previewItems.push({
                googleAccountId: acc.googleAccountId,
                accountName: acc.accountName,
                status: existing?.status || acc.status,
                newStatus: acc.status,
                newAmount: acc.spending,
                existingAmount,
                hasConflict: existingAmount !== null && existingAmount !== acc.spending,
                hasExisting: existingAmount !== null,
                isNewAccount: !existing,
                accountId: existing?.id || null,
                miName: null,
                mcName: null,
            });
        }

        const existingCount = previewItems.filter(i => i.hasExisting).length;
        const conflictCount = previewItems.filter(i => i.hasConflict).length;

        return {
            spendingDate,
            batchName: batch?.mccAccountName || parsed.batchName || 'N/A',
            batchId: batch?.id || null,
            miId: mi?.id || null,
            miName: mi?.name || null,
            dateRange: parsed.dateRange,
            totalItems: previewItems.length,
            conflictCount,
            existingCount,
            hasConflicts: conflictCount > 0,
            hasExisting: existingCount > 0,
            newAccounts: newAccountsCount,
            existingAccounts: existingAccountsCount,
            data: previewItems,
        };
    }

    async createBatchWithAccounts(data: any, userId: string, ipAddress?: string) {
        const { mccAccountId, mccAccountName, timezone, year, readiness, accounts, partnerId } = data;

        let batch;
        const isMixYear = data.isMixYear || false;

        if (mccAccountId) {
            batch = await prisma.accountBatch.findUnique({
                where: { mccAccountId }
            });
        }

        let isUpdate = false;
        if (batch) {
            isUpdate = true;
            batch = await prisma.accountBatch.update({
                where: { id: batch.id },
                data: {
                    mccAccountName: mccAccountName || batch.mccAccountName,
                    timezone: timezone || batch.timezone,
                    year: year ? parseInt(year.toString()) : batch.year,
                    isMixYear: isMixYear !== undefined ? isMixYear : batch.isMixYear,
                    readiness: readiness !== undefined ? parseInt(readiness.toString()) : batch.readiness,
                    partnerId: partnerId !== undefined ? partnerId : batch.partnerId,
                }
            });
        } else {
            batch = await prisma.accountBatch.create({
                data: {
                    mccAccountId: mccAccountId || null,
                    mccAccountName: mccAccountName || null,
                    timezone: timezone || null,
                    year: year ? parseInt(year.toString()) : null,
                    isMixYear: isMixYear,
                    readiness: readiness ? parseInt(readiness.toString()) : 0,
                    partnerId: partnerId || null,
                    status: 'ACTIVE',
                    createdById: userId,
                }
            });
        }

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
                        mccAccountName: batch.mccAccountName || null,
                        mccAccountId: batch.mccAccountId || null,
                    });
                    results.updated++;
                } else {
                    await accountRepository.create({
                        googleAccountId,
                        accountName,
                        status: status || 'ACTIVE',
                        currency: currency || 'USD',
                        batchId: batch.id,
                        mccAccountName: batch.mccAccountName || null,
                        mccAccountId: batch.mccAccountId || null,
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
            action: isUpdate ? 'UPDATE' : 'CREATE',
            entityType: 'AccountBatch',
            entityId: batch.id,
            newValues: { mccAccountName: batch.mccAccountName, accountsCreated: results.created, accountsUpdated: results.updated },
            description: `${isUpdate ? 'Cập nhật' : 'Tạo'} Lô "${batch.mccAccountName}" với ${results.created + results.updated} tài khoản`,
            ipAddress
        });

        return {
            message: `Batch ${isUpdate ? 'updated' : 'created'} successfully`,
            batch,
            results
        };
    }

    async createInvoiceMCCWithAccounts(data: any, userId: string, ipAddress?: string) {
        const { mccInvoiceId, name, partnerId, notes, accounts } = data;

        // 1. Check if existing MI
        let mi = await invoiceMCCRepository.findByMccId(mccInvoiceId);
        let isUpdate = false;
        
        if (mi) {
            isUpdate = true;
            mi = await invoiceMCCRepository.update(mi.id, {
                name,
                partnerId: partnerId || null,
                notes: notes || null,
            });
        } else {
            mi = await invoiceMCCRepository.create({
                name,
                mccInvoiceId,
                status: 'ACTIVE',
                creditStatus: 'PENDING',
                notes: notes || null,
                partnerId: partnerId || null,
                createdById: userId,
            } as any);
        }

        // 2. Process accounts - no longer mandatory to belong to an MA
        const results = { created: 0, updated: 0, linked: 0, errors: 0, errorMessages: [] as string[] };
        const affectedBatchIds = new Set<string>();
        for (const account of accounts) {
            try {
                const { googleAccountId, accountName, status, currency } = account;
                if (!googleAccountId) continue;

                const existingAcc = await accountRepository.findByGoogleId(googleAccountId);

                if (existingAcc) {
                    if (existingAcc.batchId) affectedBatchIds.add(existingAcc.batchId);

                    await accountRepository.update(existingAcc.id, {
                        accountName,
                        status,
                        currentMiId: mi.id,
                        // Retain existing batchId if any, but don't force one.
                    });
                    results.updated++;
                } else {
                    await accountRepository.create({
                        googleAccountId,
                        accountName,
                        status: status || 'ACTIVE',
                        currency: currency || 'USD',
                        currentMiId: mi.id,
                        mccAccountName: name,
                        mccAccountId: mccInvoiceId
                        // batchId is now optional
                    });
                    results.created++;
                }
                results.linked++;
            } catch (err: any) {
                results.errors++;
                if (results.errorMessages.length < 5) {
                    results.errorMessages.push(err.message || String(err));
                }
            }
        }

        // Update counts for affected batches
        for (const id of affectedBatchIds) {
            await batchRepository.updateBatchCounts(id);
        }

        // Update MI counts
        await invoiceMCCRepository.syncCounts(mi.id);


        await logActivity({
            userId,
            action: isUpdate ? 'UPDATE' : 'CREATE',
            entityType: 'InvoiceMCC',
            entityId: mi.id,
            description: `${isUpdate ? 'Cập nhật' : 'Tạo'} MI "${name}" từ file với ${results.linked} tài khoản`,
            ipAddress
        });

        return {
            message: `MI ${isUpdate ? 'updated' : 'created'} successfully`,
            mi,
            results
        };
    }

    async confirmSpending(data: any, userId: string, ipAddress?: string) {
        // Implementation logic for confirming spending, similar to ConfirmSpendingUseCase
        // We can use spendingService.createSnapshot and spendingService.calculateRecords here
        const results = { snapshots: 0, accountsAffected: new Set<string>() };

        await prisma.$transaction(async (tx: any) => {
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
