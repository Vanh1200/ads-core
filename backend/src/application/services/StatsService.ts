import prisma from '../../infrastructure/database/prisma';

export class StatsService {
    async getSummary() {
        const [batches, invoiceMCCs, customers, accounts] = await Promise.all([
            prisma.accountBatch.count(),
            prisma.invoiceMCC.count(),
            prisma.customer.count(),
            prisma.account.count(),
        ]);
        return { batches, invoiceMCCs, customers, accounts };
    }

    async getTopSpenders(limit: number = 5) {
        return prisma.account.findMany({
            take: limit,
            orderBy: { totalSpending: 'desc' },
            select: { id: true, googleAccountId: true, accountName: true, totalSpending: true, currency: true },
        });
    }

    async getRecentActivity(limit: number = 10) {
        return prisma.activityLog.findMany({
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: { user: { select: { fullName: true, email: true } } },
        });
    }
}

export const statsService = new StatsService();
