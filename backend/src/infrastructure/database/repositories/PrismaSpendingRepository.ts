import prisma from '../prisma';
import { ISpendingRepository } from '../../../domain/repositories/ISpendingRepository';
import { SpendingRecord } from '../../../domain/entities/SpendingRecord';
import { Prisma } from '@prisma/client';

export { ISpendingRepository };

export class PrismaSpendingRepository implements ISpendingRepository {
    async findByAccountAndDate(accountId: string, date: Date): Promise<SpendingRecord | null> {
        const record = await prisma.spendingRecord.findUnique({
            where: { accountId_spendingDate: { accountId, spendingDate: date } },
        });
        return this.mapToEntity(record);
    }

    async findLatestByAccount(accountId: string): Promise<SpendingRecord | null> {
        const record = await prisma.spendingRecord.findFirst({
            where: { accountId },
            orderBy: { spendingDate: 'desc' },
        });
        return this.mapToEntity(record);
    }

    async upsert(data: Omit<SpendingRecord, 'id' | 'createdAt'>): Promise<SpendingRecord> {
        const record = await prisma.spendingRecord.upsert({
            where: { accountId_spendingDate: { accountId: data.accountId, spendingDate: data.spendingDate } },
            create: {
                spendingDate: data.spendingDate,
                amount: data.amount as any,
                currency: data.currency,
                periodStart: data.periodStart,
                periodEnd: data.periodEnd,
                account: { connect: { id: data.accountId } },
                invoiceMcc: data.invoiceMccId ? { connect: { id: data.invoiceMccId } } : undefined,
                customer: data.customerId ? { connect: { id: data.customerId } } : undefined,
            },
            update: {
                amount: data.amount as any,
                periodStart: data.periodStart,
                periodEnd: data.periodEnd,
            },
        });
        return this.mapToEntity(record)!;
    }

    async getDailyStats(params: { startDate: Date; endDate: Date }): Promise<any[]> {
        const stats = await prisma.spendingRecord.groupBy({
            by: ['spendingDate'],
            _sum: { amount: true },
            where: {
                spendingDate: {
                    gte: params.startDate,
                    lte: params.endDate
                }
            },
            orderBy: {
                spendingDate: 'asc'
            }
        });

        return stats.map(s => ({
            date: s.spendingDate,
            total: Number(s._sum.amount || 0)
        }));
    }

    async getSummary(params: any): Promise<any> {
        const { type, id, startDate, endDate, accountId, miId, mcId } = params;
        const where: any = {};
        if (startDate || endDate) {
            where.spendingDate = {};
            if (startDate) where.spendingDate.gte = new Date(startDate);
            if (endDate) where.spendingDate.lte = new Date(endDate);
        }
        if (accountId) where.accountId = accountId;
        if (miId) where.invoiceMccId = miId;
        if (mcId) where.customerId = mcId;
        if (type === 'customer' && id) where.customerId = id;
        if (type === 'invoice-mcc' && id) where.invoiceMccId = id;
        if (type === 'batch' && id) where.account = { batchId: id };

        return prisma.spendingRecord.aggregate({
            where,
            _sum: { amount: true },
            _count: true
        });
    }

    private mapToEntity(prismaRecord: any): SpendingRecord | null {
        if (!prismaRecord) return null;
        return {
            ...prismaRecord,
            amount: Number(prismaRecord.amount),
        } as SpendingRecord;
    }
}

export const spendingRepository = new PrismaSpendingRepository();
