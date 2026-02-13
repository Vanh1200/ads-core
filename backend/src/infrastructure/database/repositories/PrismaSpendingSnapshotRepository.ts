import prisma from '../prisma';
import { ISpendingSnapshotRepository, SpendingSnapshot } from '../../../domain/repositories/ISpendingSnapshotRepository';

export { ISpendingSnapshotRepository, SpendingSnapshot };

export class PrismaSpendingSnapshotRepository implements ISpendingSnapshotRepository {
    async findById(id: string): Promise<SpendingSnapshot | null> {
        const snapshot = await prisma.spendingSnapshot.findUnique({
            where: { id },
            include: {
                account: { select: { id: true, googleAccountId: true, accountName: true } },
                invoiceMcc: { select: { id: true, name: true } },
                customer: { select: { id: true, name: true } },
                createdBy: { select: { id: true, fullName: true } },
            },
        });
        return this.mapToEntity(snapshot);
    }

    async list(params: { page: number; limit: number; accountId?: string; date?: Date }): Promise<{ data: SpendingSnapshot[]; total: number }> {
        const { page, limit, accountId, date } = params;
        const where: any = {};
        if (accountId) where.accountId = accountId;
        if (date) where.spendingDate = date;

        const [snapshots, total] = await Promise.all([
            prisma.spendingSnapshot.findMany({
                where,
                include: {
                    account: { select: { id: true, googleAccountId: true, accountName: true } },
                    invoiceMcc: { select: { id: true, name: true } },
                    customer: { select: { id: true, name: true } },
                    createdBy: { select: { id: true, fullName: true } },
                },
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { snapshotAt: 'desc' },
            }),
            prisma.spendingSnapshot.count({ where }),
        ]);

        return {
            data: snapshots.map(s => this.mapToEntity(s)!),
            total,
        };
    }

    async create(data: Omit<SpendingSnapshot, 'id' | 'createdAt'>): Promise<SpendingSnapshot> {
        const snapshot = await prisma.spendingSnapshot.create({
            data: {
                ...data,
                cumulativeAmount: data.cumulativeAmount, // Prisma handles number to Decimal if configured or explicit cast
            } as any, // TypeScript and Prisma Decimal can be tricky, cast to any for now to avoid complexity in this step
        });
        return this.mapToEntity(snapshot)!;
    }

    async findByAccountAndDate(accountId: string, date: Date): Promise<SpendingSnapshot[]> {
        const snapshots = await prisma.spendingSnapshot.findMany({
            where: { accountId, spendingDate: date },
            orderBy: { snapshotAt: 'asc' },
        });
        return snapshots.map(s => this.mapToEntity(s)!);
    }

    private mapToEntity(prismaSnapshot: any): SpendingSnapshot | null {
        if (!prismaSnapshot) return null;
        return {
            ...prismaSnapshot,
            cumulativeAmount: Number(prismaSnapshot.cumulativeAmount),
        } as SpendingSnapshot;
    }
}

export const spendingSnapshotRepository = new PrismaSpendingSnapshotRepository();
