import prisma from '../prisma';
import { IBatchRepository } from '../../../domain/repositories/IBatchRepository';
import { AccountBatch } from '../../../domain/entities/AccountBatch';
import { BatchStatus } from '@prisma/client';

export class PrismaBatchRepository implements IBatchRepository {
    async findById(id: string): Promise<AccountBatch | null> {
        return prisma.accountBatch.findUnique({
            where: { id },
            include: { accounts: { include: { currentMi: true, currentMc: true } } },
        }) as Promise<AccountBatch | null>;
    }

    async list(params: { page: number; limit: number; status?: string; year?: number; isMixYear?: boolean }): Promise<{ data: AccountBatch[]; total: number }> {
        const { page, limit, status, year, isMixYear } = params;
        const where: any = {};
        if (status) where.status = status as BatchStatus;
        if (year) where.year = year;
        if (isMixYear !== undefined) where.isMixYear = isMixYear;

        const [batches, total] = await Promise.all([
            prisma.accountBatch.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            prisma.accountBatch.count({ where }),
        ]);

        return {
            data: batches as AccountBatch[],
            total,
        };
    }

    async create(data: Omit<AccountBatch, 'id' | 'createdAt' | 'updatedAt' | 'totalAccounts' | 'liveAccounts'>): Promise<AccountBatch> {
        return prisma.accountBatch.create({
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
        }) as Promise<AccountBatch>;
    }

    async update(id: string, data: Partial<AccountBatch>): Promise<AccountBatch> {
        const updateData: any = { ...data };
        if (data.status) updateData.status = data.status as BatchStatus;
        if (data.createdById) {
            delete updateData.createdById;
            updateData.createdBy = { connect: { id: data.createdById } };
        }

        return prisma.accountBatch.update({
            where: { id },
            data: updateData,
        }) as Promise<AccountBatch>;
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
        const totalAccounts = accountCounts.reduce((sum, c) => sum + c._count, 0);
        const liveAccounts = accountCounts.find(c => c.status === 'ACTIVE')?._count || 0;
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
}

export const batchRepository = new PrismaBatchRepository();
