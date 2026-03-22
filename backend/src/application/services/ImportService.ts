
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
        const googleAccountIds = parsed.accounts.map(a => a.googleAccountId);

        // Batch look up all accounts by Google Account ID
        const accounts = await prisma.account.findMany({
            where: { googleAccountId: { in: googleAccountIds } },
            include: {
                currentMi: { select: { name: true } },
                currentMc: { select: { name: true } },
            }
        });

        const accountMap = new Map(accounts.map(a => [a.googleAccountId, a]));
        const accountDbIds = accounts.map(a => a.id);

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

        const targetDate = new Date(spendingDate + 'T00:00:00.000Z');

        // Batch look up all latest DAILY_FINAL snapshots for these accounts on the target date
        const snapshots = await prisma.spendingSnapshot.findMany({
            where: {
                accountId: { in: accountDbIds },
                spendingDate: targetDate,
                snapshotType: 'DAILY_FINAL',
            },
            orderBy: { snapshotAt: 'desc' },
        });

        // Create a map of accountId -> most recent snapshot amount
        const snapshotMap = new Map();
        snapshots.forEach(s => {
            if (!snapshotMap.has(s.accountId)) {
                snapshotMap.set(s.accountId, Number(s.cumulativeAmount));
            }
        });

        const previewItems: any[] = [];
        let newAccountsCount = 0;
        let existingAccountsCount = 0;

        for (const acc of parsed.accounts) {
            const existing = accountMap.get(acc.googleAccountId);
            let existingAmount: number | null = null;

            if (existing) {
                existingAccountsCount++;
                existingAmount = snapshotMap.get(existing.id) ?? null;
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
                hasConflict: existingAmount !== null && Math.abs(existingAmount - acc.spending) > 0.001,
                hasExisting: existingAmount !== null,
                isNewAccount: !existing,
                accountId: existing?.id || null,
                miName: existing?.currentMi?.name || null,
                mcName: existing?.currentMc?.name || null,
            });
        }

        const existingCount = previewItems.filter(i => i.hasExisting).length;
        const conflictCount = previewItems.filter(i => i.hasConflict).length;

        return {
            spendingDate,
            batchName: batch?.mccAccountName || parsed.batchName || 'N/A',
            batchId: batch?.id || null,
            mccAccountId: batch?.mccAccountId || parsed.mccAccountId || null,
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
                    // Logic: If currently INACTIVE, stay INACTIVE. Only allow changing from ACTIVE to INACTIVE.
                    const finalStatus = (existing.status === 'INACTIVE') ? 'INACTIVE' : (status || existing.status);
                    
                    await accountRepository.update(existing.id, {
                        accountName,
                        status: finalStatus,
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

                    // Logic: If currently INACTIVE, stay INACTIVE. Only allow changing from ACTIVE to INACTIVE.
                    const finalStatus = (existingAcc.status === 'INACTIVE') ? 'INACTIVE' : (status || existingAcc.status);

                    await accountRepository.update(existingAcc.id, {
                        accountName,
                        status: finalStatus,
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
        const { spendingDate, records, overwrite, miId } = {
            spendingDate: data.spendingDate,
            records: data.data || [], // Frontend sends it as 'data'
            overwrite: data.overwrite || false,
            miId: data.miId
        };

        if (records.length === 0) return { message: 'No records to import', results: { snapshotsCreated: 0 } };

        const targetDate = new Date(spendingDate + 'T00:00:00.000Z');
        const accountIds = records.filter((r: any) => r.accountId).map((r: any) => r.accountId);
        const uniqueAccountIds = [...new Set(accountIds)] as string[];

        const results = { snapshotsCreated: 0, accountsAffected: uniqueAccountIds.length };

        await prisma.$transaction(async (tx: any) => {
            // 1. Handle Overwrite
            if (overwrite) {
                await tx.spendingSnapshot.deleteMany({
                    where: {
                        accountId: { in: uniqueAccountIds },
                        spendingDate: targetDate,
                        snapshotType: 'DAILY_FINAL'
                    }
                });
            }

            // 2. Batch Create Snapshots
            const snapshotData = records
                .filter((r: any) => r.accountId)
                .map((item: any) => ({
                    accountId: item.accountId,
                    cumulativeAmount: item.newAmount, // Use newAmount from frontend
                    snapshotAt: targetDate,
                    spendingDate: targetDate,
                    snapshotType: 'DAILY_FINAL',
                    createdById: userId,
                    invoiceMccId: miId || item.currentMiId || null,
                    customerId: item.currentMcId || null
                }));

            if (snapshotData.length > 0) {
                const created = await tx.spendingSnapshot.createMany({
                    data: snapshotData,
                    skipDuplicates: true // In case some were not deleted or we have duplicates in file
                });
                results.snapshotsCreated = created.count;
            }
        });

        // 3. Batch Sync Records (Post-transaction)
        // We do this in chunks to avoid overwhelming the system, but still faster than one-by-one in a loop
        const chunkSize = 20;
        for (let i = 0; i < uniqueAccountIds.length; i += chunkSize) {
            const chunk = uniqueAccountIds.slice(i, i + chunkSize);
            await Promise.all(chunk.map(id => spendingService.calculateRecords(id, spendingDate).catch(e => console.error(`Failed to sync account ${id}:`, e))));
        }

        await logActivity({
            userId,
            action: 'IMPORT_SPENDING',
            entityType: 'Spending',
            entityId: 'BULK',
            description: `Imported spending for ${results.accountsAffected} accounts (${results.snapshotsCreated} snapshots). Overwrite: ${overwrite}`,
            ipAddress
        });

        return { 
            message: `Successfully imported ${results.snapshotsCreated} snapshots for ${results.accountsAffected} accounts.`,
            results: {
                spendingCreated: results.snapshotsCreated,
                accountsAffected: results.accountsAffected
            }
        };
    }
}

export const importService = new ImportService();
