import { Router, Response } from 'express';
import prisma from '../config/database';
import { authenticateToken, AuthRequest, canView } from '../middleware/auth.middleware';

const router = Router();

// GET /api/dashboard/summary - Consolidated dashboard metrics
router.get('/summary', authenticateToken, canView, async (req: AuthRequest, res: Response) => {
    try {
        const { days = '30' } = req.query;
        const numDays = parseInt(days as string);

        const endDate = new Date();
        const startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        startDate.setDate(startDate.getDate() - numDays);

        // Execute all queries in parallel
        const [
            batchCount,
            miCount,
            customerCount,
            accountCount,
            topSpenders,
            spendingRecords,
            recentActivity
        ] = await Promise.all([
            prisma.accountBatch.count(),
            prisma.invoiceMCC.count(),
            prisma.customer.count(),
            prisma.account.count(),
            // Top 5 Spenders
            prisma.account.findMany({
                take: 5,
                orderBy: { totalSpending: 'desc' },
                select: {
                    id: true,
                    googleAccountId: true,
                    accountName: true,
                    totalSpending: true,
                    currency: true
                }
            }),
            // Chart Data Aggregation
            prisma.spendingRecord.groupBy({
                by: ['spendingDate'],
                where: {
                    spendingDate: {
                        gte: startDate,
                        lte: endDate,
                    },
                },
                _sum: { amount: true },
                orderBy: { spendingDate: 'asc' },
            }),
            // Recent Activity
            prisma.activityLog.findMany({
                take: 10,
                orderBy: { createdAt: 'desc' },
                include: {
                    user: { select: { fullName: true, email: true } }
                }
            })
        ]);

        // Process Chart Data: Fill in missing dates with 0
        const chartData = [];
        const currentDate = new Date(startDate);
        const end = new Date(endDate);

        while (currentDate <= end) {
            const dateStr = currentDate.toISOString().split('T')[0];
            const record = spendingRecords.find(r => r.spendingDate.toISOString().split('T')[0] === dateStr);

            chartData.push({
                date: dateStr,
                amount: Number(record?._sum.amount || 0),
            });

            currentDate.setDate(currentDate.getDate() + 1);
        }

        const totalAmount = chartData.reduce((sum, d) => sum + d.amount, 0);

        res.json({
            counts: {
                batches: batchCount,
                invoiceMCCs: miCount,
                customers: customerCount,
                accounts: accountCount
            },
            topSpenders,
            chart: {
                startDate: startDate.toISOString().split('T')[0],
                endDate: endDate.toISOString().split('T')[0],
                data: chartData,
                totalAmount,
                currency: 'USD'
            },
            recentActivity
        });

    } catch (error) {
        console.error('Dashboard summary error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
