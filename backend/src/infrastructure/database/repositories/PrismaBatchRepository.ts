import prisma from '../prisma';
import { IBatchRepository } from '../../../domain/repositories/IBatchRepository';
import { AccountBatch } from '../../../domain/entities/AccountBatch';
import { BatchStatus } from '@prisma/client';

export class PrismaBatchRepository implements IBatchRepository {
    async findById(id: string): Promise<AccountBatch | null> {
        const batch = await prisma.accountBatch.findUnique({
            where: { id },
            include: {
                _count: { select: { accounts: true } },
                accounts: { include: { currentMi: true, currentMc: true } },
                partner: true
            },
        });
        return this.mapToEntity(batch);
    }

    async list(params: {
        page: number;
        limit: number;
        search?: string;
        status?: string;
        year?: number;
        isMixYear?: boolean;
        timezone?: string;
        currency?: string;
        partnerId?: string;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
        ids?: string[];
        startDate?: Date;
        endDate?: Date;
    }): Promise<{ data: AccountBatch[]; total: number }> {
        const { page, limit, search, status, year, isMixYear, timezone, currency, partnerId, sortBy, sortOrder, ids, startDate, endDate } = params;
        const where: any = {};
        if (status) where.status = status as BatchStatus;
        if (year) where.year = year;
        if (isMixYear !== undefined) where.isMixYear = isMixYear;
        if (timezone) where.timezone = timezone;
        if (currency) where.accounts = { some: { currency } };
        if (partnerId) where.partnerId = partnerId;
        if (ids && ids.length > 0) {
            where.mccAccountId = { in: ids };
        }
        if (search) {
            where.OR = [
                { mccAccountName: { contains: search, mode: 'insensitive' } },
                { mccAccountId: { contains: search, mode: 'insensitive' } },
            ];
        }

        const include = {
            _count: { select: { accounts: true } },
            partner: true,
            accounts: {
                include: {
                    currentMi: true,
                    currentMc: true,
                    spendingRecords: startDate && endDate ? {
                        where: {
                            spendingDate: {
                                gte: startDate,
                                lte: endDate
                            }
                        },
                        select: { amount: true }
                    } : undefined,
                }
            }
        };

        // Handle dynamic sorting
        // If sorting by rangeSpending or currency, we must fetch all and sort in memory
        if (sortBy === 'rangeSpending' || sortBy === 'currency') {
            const batches = await prisma.accountBatch.findMany({
                where,
                include,
            });

            const mappedBatches = batches.map(b => this.mapToEntity(b)!);

            mappedBatches.sort((a, b) => {
                if (sortBy === 'currency') {
                    const currA = a.currency || '';
                    const currB = b.currency || '';
                    return sortOrder === 'asc' ? currA.localeCompare(currB) : currB.localeCompare(currA);
                } else {
                    const spendA = a.rangeSpending || 0;
                    const spendB = b.rangeSpending || 0;
                    return sortOrder === 'asc' ? spendA - spendB : spendB - spendA;
                }
            });

            const startIndex = (page - 1) * limit;
            const paginatedBatches = mappedBatches.slice(startIndex, startIndex + limit);

            return {
                data: paginatedBatches,
                total: batches.length,
            };
        }

        const orderBy: any = {};
        if (sortBy) {
            orderBy[sortBy] = sortOrder || 'desc';
        } else {
            orderBy.createdAt = 'desc';
        }

        const [batches, total] = await Promise.all([
            prisma.accountBatch.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy,
                include,
            }),
            prisma.accountBatch.count({ where }),
        ]);

        return {
            data: batches.map(b => this.mapToEntity(b)!),
            total,
        };
    }

    async create(data: Omit<AccountBatch, 'id' | 'createdAt' | 'updatedAt' | 'totalAccounts' | 'liveAccounts'>): Promise<AccountBatch> {
        const batch = await prisma.accountBatch.create({
            data: {
                mccAccountName: data.mccAccountName,
                mccAccountId: data.mccAccountId,
                isPrelinked: data.isPrelinked,
                timezone: data.timezone,
                year: data.year,
                isMixYear: data.isMixYear,
                readiness: data.readiness,
                notes: data.notes,
                status: data.status as BatchStatus,
                partner: data.partnerId ? { connect: { id: data.partnerId } } : undefined,
                createdBy: { connect: { id: data.createdById } },
            },
        });
        return this.mapToEntity(batch)!;
    }

    async update(id: string, data: Partial<AccountBatch>): Promise<AccountBatch> {
        const updateData: any = { ...data };
        if (data.status) updateData.status = data.status as BatchStatus;
        if (data.createdById) {
            delete updateData.createdById;
            updateData.createdBy = { connect: { id: data.createdById } };
        }

        const batch = await prisma.accountBatch.update({
            where: { id },
            data: updateData,
        });
        return this.mapToEntity(batch)!;
    }

    async updateMany(ids: string[], data: Partial<AccountBatch>): Promise<{ count: number }> {
        const updateData: any = { ...data };
        if (data.status) updateData.status = data.status as BatchStatus;
        if (updateData.createdById) delete updateData.createdById;

        return prisma.accountBatch.updateMany({
            where: { id: { in: ids } },
            data: updateData,
        });
    }

    async updateBatchCounts(id: string): Promise<void> {
        const accountCounts = await prisma.account.groupBy({
            by: ['status'],
            where: { batchId: id },
            _count: true,
        });
        const totalAccounts = accountCounts.reduce((sum: number, c: any) => sum + (c._count as number), 0);
        const liveAccounts = accountCounts.find((c: any) => c.status === 'ACTIVE')?._count || 0;
        await prisma.accountBatch.update({
            where: { id },
            data: { totalAccounts, liveAccounts },
        });
    }

    async delete(id: string): Promise<void> {
        await prisma.accountBatch.delete({ where: { id } });
    }

    async findAccountsByBatchId(batchId: string, params: any): Promise<{ data: any[]; total: number }> {
        const { page = 1, limit = 20 } = params;
        const [accounts, total] = await Promise.all([
            prisma.account.findMany({
                where: { batchId },
                skip: (Number(page) - 1) * Number(limit),
                take: Number(limit),
                include: { currentMi: true, currentMc: true },
            }),
            prisma.account.count({ where: { batchId } }),
        ]);
        return { data: accounts, total };
    }

    private mapToEntity(prismaBatch: any): AccountBatch | null {
        if (!prismaBatch) return null;

        let rangeSpending = 0;
        let currency: string | null = null;
        
        if (prismaBatch.accounts && Array.isArray(prismaBatch.accounts)) {
            if (prismaBatch.accounts.length > 0) {
                const firstCurrency = prismaBatch.accounts[0].currency;
                const isMixed = prismaBatch.accounts.some((a: any) => a.currency !== firstCurrency);
                currency = isMixed ? 'Mix' : firstCurrency;
            }

            for (const account of prismaBatch.accounts) {
                if (account.spendingRecords && Array.isArray(account.spendingRecords)) {
                    const accountSpending = account.spendingRecords.reduce((sum: number, r: any) => sum + Number(r.amount), 0);
                    rangeSpending += accountSpending;
                }
            }
        }

        return {
            ...prismaBatch,
            totalAccounts: prismaBatch._count?.accounts ?? prismaBatch.totalAccounts ?? 0,
            status: prismaBatch.status as 'ACTIVE' | 'INACTIVE',
            rangeSpending,
            currency,
        } as AccountBatch;
    }
}

export const batchRepository = new PrismaBatchRepository();
