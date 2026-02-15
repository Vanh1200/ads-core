import { spendingRepository, ISpendingRepository } from '../../infrastructure/database/repositories/PrismaSpendingRepository';
import { spendingSnapshotRepository, ISpendingSnapshotRepository } from '../../infrastructure/database/repositories/PrismaSpendingSnapshotRepository';
import { accountRepository } from '../../infrastructure/database/repositories/PrismaAccountRepository';
import { IAccountRepository } from '../../domain/repositories/IAccountRepository';
import prisma from '../../infrastructure/database/prisma';

export class SpendingService {
    constructor(
        private readonly spendingRepo: ISpendingRepository = spendingRepository,
        private readonly snapshotRepo: ISpendingSnapshotRepository = spendingSnapshotRepository,
        private readonly accountRepo: IAccountRepository = accountRepository
    ) { }

    async getSummary(params: any) {
        return this.spendingRepo.getSummary(params);
    }

    async getDailyStats(params: any) {
        return this.spendingRepo.getDailyStats(params);
    }

    async getGlobalChart(days?: number, startDateParam?: string, endDateParam?: string) {
        let startDate: Date;
        let endDate: Date;

        if (startDateParam && endDateParam) {
            startDate = new Date(startDateParam);
            endDate = new Date(endDateParam);
        } else {
            const d = days || 7;
            endDate = new Date();
            startDate = new Date();
            startDate.setDate(startDate.getDate() - d);
        }

        const stats = await this.spendingRepo.getDailyStats({ startDate, endDate });

        const data = stats.map((s: any) => ({
            date: s.date.toISOString().split('T')[0],
            amount: Number(s.total || 0)
        }));

        const totalAmount = data.reduce((sum: number, item: any) => sum + item.amount, 0);

        return { totalAmount, data };
    }

    async getAccountChart(accountId: string, days: number = 7) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const records = await prisma.spendingRecord.findMany({
            where: {
                accountId,
                spendingDate: { gte: startDate }
            },
            orderBy: { spendingDate: 'asc' }
        });

        // Group by date
        const grouped = records.reduce((acc: Record<string, number>, curr: any) => {
            const date = curr.spendingDate.toISOString().split('T')[0];
            acc[date] = (acc[date] || 0) + Number(curr.amount);
            return acc;
        }, {});

        return Object.entries(grouped).map(([date, amount]) => ({ date, amount }));
    }

    async calculateRecords(accountId: string, spendingDate: string) {
        const account = await this.accountRepo.findById(accountId);
        if (!account) throw new Error('NOT_FOUND: Account not found');

        const date = new Date(spendingDate);
        const snapshots = await this.snapshotRepo.findByAccountAndDate(accountId, date);
        if (snapshots.length === 0) throw new Error('BAD_REQUEST: No snapshots found for this date');

        await prisma.spendingRecord.deleteMany({ where: { accountId, spendingDate: date } });

        const records = [];
        let previousCumulative = 0;
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);

        for (let i = 0; i < snapshots.length; i++) {
            const snapshot = snapshots[i];
            const amount = snapshot.cumulativeAmount - previousCumulative;

            if (amount > 0) {
                const periodStart = i === 0 ? startOfDay : snapshots[i - 1].snapshotAt;
                const record = await this.spendingRepo.upsert({
                    accountId,
                    spendingDate: date,
                    amount,
                    currency: account.currency,
                    invoiceMccId: snapshot.invoiceMccId,
                    customerId: snapshot.customerId,
                    periodStart,
                    periodEnd: snapshot.snapshotAt,
                });
                records.push(record);
            }
            previousCumulative = snapshot.cumulativeAmount;
        }

        const totalSpending = await prisma.spendingRecord.aggregate({
            where: { accountId },
            _sum: { amount: true }
        });

        await this.accountRepo.update(accountId, {
            totalSpending: Number(totalSpending._sum.amount || 0),
            lastSynced: new Date()
        });

        return { message: `Created ${records.length} spending records`, records };
    }

    async createSnapshot(data: any) {
        return this.snapshotRepo.create(data);
    }

    async listSnapshots(params: any) {
        return this.snapshotRepo.list(params);
    }

    async getRangeSpendingMap(type: 'batch' | 'customer' | 'invoice-mcc', ids: string[], days: number = 7) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const where: any = {
            spendingDate: { gte: startDate }
        };

        if (type === 'batch') {
            where.account = { batchId: { in: ids } };
        } else if (type === 'customer') {
            where.customerId = { in: ids };
        } else if (type === 'invoice-mcc') {
            where.invoiceMccId = { in: ids };
        }

        const field = type === 'batch' ? 'batchId' : (type === 'customer' ? 'customerId' : 'invoiceMccId');

        const records = await prisma.spendingRecord.groupBy({
            by: type === 'batch' ? [] : [field as any],
            where,
            _sum: { amount: true },
            ...(type === 'batch' ? {} : {}) // Special handling for batch as it's through account
        });

        // Prisma doesn't support grouping by relational fields (account.batchId) directly in groupBy
        // If type is batch, we might need a different approach or fetch more data
        if (type === 'batch') {
            const batchSpends = await prisma.spendingRecord.findMany({
                where,
                select: {
                    amount: true,
                    account: { select: { batchId: true } }
                }
            });

            const map: Record<string, number> = {};
            batchSpends.forEach(s => {
                const bId = s.account.batchId;
                map[bId] = (map[bId] || 0) + Number(s.amount);
            });
            return map;
        }

        const map: Record<string, number> = {};
        records.forEach((r: any) => {
            const id = r[field];
            if (id) {
                map[id] = Number(r._sum.amount || 0);
            }
        });
        return map;
    }
}

export const spendingService = new SpendingService();
