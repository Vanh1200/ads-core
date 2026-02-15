import prisma from '../prisma';
import { IBatchRepository } from '../../../domain/repositories/IBatchRepository';
import { AccountBatch } from '../../../domain/entities/AccountBatch';
import { BatchStatus } from '@prisma/client';

export class PrismaBatchRepository implements IBatchRepository {
    async findById(id: string): Promise<AccountBatch | null> {
        const batch = await prisma.accountBatch.findUnique({
            where: { id },
            include: { accounts: { include: { currentMi: true, currentMc: true } } },
        });
        return this.mapToEntity(batch);
    }

    async list(params: {
        page: number;
        limit: number;
        status?: string;
        year?: number;
        isMixYear?: boolean;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
        ids?: string[];
    }): Promise<{ data: AccountBatch[]; total: number }> {
        const { page, limit, status, year, isMixYear, sortBy, sortOrder, ids } = params;
        const where: any = {};
        if (status) where.status = status as BatchStatus;
        if (year) where.year = year;
        if (isMixYear !== undefined) where.isMixYear = isMixYear;
        if (ids && ids.length > 0) {
            where.mccAccountId = { in: ids };
        }

        // Handle dynamic sorting
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
        return {
            ...prismaBatch,
            status: prismaBatch.status as 'ACTIVE' | 'INACTIVE',
        } as AccountBatch;
    }
}

export const batchRepository = new PrismaBatchRepository();
