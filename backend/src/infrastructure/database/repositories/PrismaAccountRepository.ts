import prisma from '../prisma';
import { IAccountRepository } from '../../../domain/repositories/IAccountRepository';
import { Account } from '../../../domain/entities/Account';
import { AccountStatus, Prisma } from '@prisma/client';

export class PrismaAccountRepository implements IAccountRepository {
    async findById(id: string): Promise<Account | null> {
        const account = await prisma.account.findUnique({
            where: { id },
            include: {
                batch: { select: { id: true, mccAccountName: true } },
                currentMi: { select: { id: true, name: true } },
                currentMc: { select: { id: true, name: true } },
            },
        });
        return this.mapToEntity(account);
    }

    async findByGoogleId(googleAccountId: string): Promise<Account | null> {
        const account = await prisma.account.findUnique({ where: { googleAccountId } });
        return this.mapToEntity(account);
    }

    async list(params: {
        page: number;
        limit: number;
        q?: string;
        status?: string;
        batchId?: string;
        miId?: string;
        mcId?: string;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
        ids?: string[];
    }): Promise<{ data: Account[]; total: number }> {
        const { page, limit, q, status, batchId, miId, mcId, sortBy, sortOrder, ids } = params;
        const where: Prisma.AccountWhereInput = {};
        if (status) where.status = status as AccountStatus;
        if (batchId) where.batchId = batchId;
        if (miId) where.currentMiId = miId;
        if (mcId) where.currentMcId = mcId;
        if (ids && ids.length > 0) {
            where.googleAccountId = { in: ids };
        }
        if (q) {
            where.OR = [
                { accountName: { contains: q, mode: 'insensitive' } },
                { googleAccountId: { contains: q, mode: 'insensitive' } },
            ];
        }

        // Handle dynamic sorting
        const orderBy: any = {};
        if (sortBy) {
            orderBy[sortBy] = sortOrder || 'desc';
        } else {
            orderBy.createdAt = 'desc';
        }

        const [accounts, total] = await Promise.all([
            prisma.account.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy,
                include: {
                    currentMi: { select: { id: true, name: true } },
                    currentMc: { select: { id: true, name: true } },
                },
            }),
            prisma.account.count({ where }),
        ]);

        return {
            data: accounts.map((a: any) => this.mapToEntity(a)!),
            total,
        };
    }

    async create(data: Omit<Account, 'id' | 'createdAt' | 'updatedAt' | 'totalSpending'>): Promise<Account> {
        const account = await prisma.account.create({
            data: {
                googleAccountId: data.googleAccountId,
                accountName: data.accountName,
                currency: data.currency,
                timezone: data.timezone,
                mccAccountName: data.mccAccountName,
                mccAccountId: data.mccAccountId,
                status: (data.status as AccountStatus) || 'ACTIVE',
                totalSpending: 0,
                batch: { connect: { id: data.batchId } },
            },
        });
        return this.mapToEntity(account)!;
    }

    async update(id: string, data: Partial<Account>): Promise<Account> {
        const updateData: Prisma.AccountUpdateInput = {};
        if (data.accountName) updateData.accountName = data.accountName;
        if (data.status) updateData.status = data.status as AccountStatus;
        if (data.totalSpending !== undefined) updateData.totalSpending = data.totalSpending;
        if (data.lastSynced) updateData.lastSynced = data.lastSynced;

        const account = await prisma.account.update({
            where: { id },
            data: updateData,
        });
        return this.mapToEntity(account)!;
    }

    async updateMany(ids: string[], data: Partial<Account>): Promise<{ count: number }> {
        const updateData: Prisma.AccountUpdateManyMutationInput = {};
        if (data.status) updateData.status = data.status as AccountStatus;
        if (data.lastSynced) updateData.lastSynced = data.lastSynced;
        if (data.currentMiId !== undefined) (updateData as any).currentMiId = data.currentMiId;
        if (data.currentMcId !== undefined) (updateData as any).currentMcId = data.currentMcId;

        return prisma.account.updateMany({
            where: { id: { in: ids } },
            data: updateData,
        });
    }

    async findUnlinked(): Promise<Account[]> {
        const accounts = await prisma.account.findMany({
            where: { currentMiId: null, status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
        });
        return accounts.map((a: any) => this.mapToEntity(a)!);
    }

    async findUnassigned(): Promise<Account[]> {
        const accounts = await prisma.account.findMany({
            where: { currentMcId: null, status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
        });
        return accounts.map(a => this.mapToEntity(a)!);
    }

    private mapToEntity(prismaAccount: any): Account | null {
        if (!prismaAccount) return null;
        return {
            ...prismaAccount,
            totalSpending: Number(prismaAccount.totalSpending),
        } as Account;
    }
}

export const accountRepository = new PrismaAccountRepository();
