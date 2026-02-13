import { Router, Response } from 'express';
import prisma from '../config/database';
import { authenticateToken, AuthRequest, isUpdater, canView } from '../middleware/auth.middleware';
import { createSnapshotSchema, paginationSchema } from '../utils/validators';
import logActivity from '../utils/activityLogger';
import { Decimal } from '@prisma/client/runtime/library';

const router = Router();

// GET /api/spending/snapshots - List all snapshots
router.get('/snapshots', authenticateToken, canView, async (req: AuthRequest, res: Response) => {
    try {
        const query = paginationSchema.safeParse(req.query);
        const { page, limit } = query.success ? query.data : { page: 1, limit: 50 };
        const { accountId, date } = req.query;

        const where: any = {};
        if (accountId) where.accountId = accountId as string;
        if (date) where.spendingDate = new Date(date as string);

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

        res.json({
            data: snapshots,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error('Get snapshots error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/spending/snapshot - Create spending snapshot
router.post('/snapshot', authenticateToken, isUpdater, async (req: AuthRequest, res: Response) => {
    try {
        const { accountId, spendingDate, cumulativeAmount, snapshotType } = req.body;

        const account = await prisma.account.findUnique({
            where: { id: accountId },
            include: { currentMi: true, currentMc: true },
        });

        if (!account) {
            res.status(404).json({ error: 'Account not found' });
            return;
        }

        const snapshot = await prisma.spendingSnapshot.create({
            data: {
                accountId,
                spendingDate: new Date(spendingDate),
                cumulativeAmount,
                snapshotAt: new Date(),
                snapshotType,
                invoiceMccId: account.currentMiId,
                customerId: account.currentMcId,
                createdById: req.user!.id,
            },
        });

        await logActivity({
            userId: req.user!.id,
            action: 'SNAPSHOT',
            entityType: 'SpendingSnapshot',
            entityId: snapshot.id,
            newValues: { accountId, cumulativeAmount, snapshotType },
            description: `Tạo snapshot ${snapshotType} cho tài khoản ${account.googleAccountId}`,
            ipAddress: req.ip,
        });

        res.status(201).json(snapshot);
    } catch (error) {
        console.error('Create snapshot error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/spending/calculate - Calculate spending records from snapshots
router.post('/calculate', authenticateToken, isUpdater, async (req: AuthRequest, res: Response) => {
    try {
        const { accountId, spendingDate } = req.body;

        const account = await prisma.account.findUnique({ where: { id: accountId } });
        if (!account) {
            res.status(404).json({ error: 'Account not found' });
            return;
        }

        const date = new Date(spendingDate);

        // Get all snapshots for this account on this date, ordered by time
        const snapshots = await prisma.spendingSnapshot.findMany({
            where: {
                accountId,
                spendingDate: date,
            },
            orderBy: { snapshotAt: 'asc' },
        });

        if (snapshots.length === 0) {
            res.status(400).json({ error: 'No snapshots found for this date' });
            return;
        }

        // Clear existing spending records for this account and date
        await prisma.spendingRecord.deleteMany({
            where: { accountId, spendingDate: date },
        });

        const records = [];
        let previousCumulative = new Decimal(0);
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);

        for (let i = 0; i < snapshots.length; i++) {
            const snapshot = snapshots[i];
            const amount = new Decimal(snapshot.cumulativeAmount).minus(previousCumulative);

            if (amount.greaterThan(0)) {
                const periodStart = i === 0 ? startOfDay : snapshots[i - 1].snapshotAt;

                const record = await prisma.spendingRecord.create({
                    data: {
                        accountId,
                        spendingDate: date,
                        amount,
                        currency: account.currency,
                        invoiceMccId: snapshot.invoiceMccId,
                        customerId: snapshot.customerId,
                        periodStart,
                        periodEnd: snapshot.snapshotAt,
                    },
                });
                records.push(record);
            }

            previousCumulative = new Decimal(snapshot.cumulativeAmount);
        }

        // Update account total spending
        const totalSpending = await prisma.spendingRecord.aggregate({
            where: { accountId },
            _sum: { amount: true },
        });

        await prisma.account.update({
            where: { id: accountId },
            data: {
                totalSpending: totalSpending._sum.amount || 0,
                lastSynced: new Date(),
            },
        });

        res.json({
            message: `Created ${records.length} spending records`,
            records,
        });
    } catch (error) {
        console.error('Calculate spending error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/spending/records - Get spending records
router.get('/records', authenticateToken, canView, async (req: AuthRequest, res: Response) => {
    try {
        const { accountId, miId, mcId, startDate, endDate } = req.query;

        const where: any = {};
        if (accountId) where.accountId = accountId as string;
        if (miId) where.invoiceMccId = miId as string;
        if (mcId) where.customerId = mcId as string;
        if (startDate || endDate) {
            where.spendingDate = {};
            if (startDate) where.spendingDate.gte = new Date(startDate as string);
            if (endDate) where.spendingDate.lte = new Date(endDate as string);
        }

        const records = await prisma.spendingRecord.findMany({
            where,
            include: {
                account: { select: { id: true, googleAccountId: true, accountName: true } },
                invoiceMcc: { select: { id: true, name: true } },
                customer: { select: { id: true, name: true } },
            },
            orderBy: [{ spendingDate: 'desc' }, { periodStart: 'asc' }],
        });

        // Calculate totals
        const totals = await prisma.spendingRecord.aggregate({
            where,
            _sum: { amount: true },
            _count: true,
        });

        res.json({
            data: records,
            totals: {
                totalAmount: totals._sum.amount || 0,
                recordCount: totals._count,
            },
        });
    } catch (error) {
        console.error('Get spending records error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/spending/summary/customer/:id
router.get('/summary/customer/:id', authenticateToken, canView, async (req: AuthRequest, res: Response) => {
    try {
        const { startDate, endDate } = req.query;
        const where: any = { customerId: req.params.id as string };

        if (startDate || endDate) {
            where.spendingDate = {};
            if (startDate) where.spendingDate.gte = new Date(startDate as string);
            if (endDate) where.spendingDate.lte = new Date(endDate as string);
        }

        const records = await prisma.spendingRecord.groupBy({
            by: ['spendingDate'],
            where,
            _sum: { amount: true },
            orderBy: { spendingDate: 'desc' },
        });

        const totalSum = await prisma.spendingRecord.aggregate({
            where,
            _sum: { amount: true },
        });

        res.json({
            dailySpending: records,
            totalSpending: totalSum._sum.amount || 0,
        });
    } catch (error) {
        console.error('Get customer summary error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/spending/summary/invoice-mcc/:id
router.get('/summary/invoice-mcc/:id', authenticateToken, canView, async (req: AuthRequest, res: Response) => {
    try {
        const { startDate, endDate } = req.query;
        const where: any = { invoiceMccId: req.params.id as string };

        if (startDate || endDate) {
            where.spendingDate = {};
            if (startDate) where.spendingDate.gte = new Date(startDate as string);
            if (endDate) where.spendingDate.lte = new Date(endDate as string);
        }

        const records = await prisma.spendingRecord.groupBy({
            by: ['spendingDate'],
            where,
            _sum: { amount: true },
            orderBy: { spendingDate: 'desc' },
        });

        const totalSum = await prisma.spendingRecord.aggregate({
            where,
            _sum: { amount: true },
        });

        res.json({
            dailySpending: records,
            totalSpending: totalSum._sum.amount || 0,
        });
    } catch (error) {
        console.error('Get invoice MCC summary error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/spending/summary/batch/:id
router.get('/summary/batch/:id', authenticateToken, canView, async (req: AuthRequest, res: Response) => {
    try {
        const { startDate, endDate } = req.query;
        const where: any = { account: { batchId: req.params.id as string } };

        if (startDate || endDate) {
            where.spendingDate = {};
            if (startDate) where.spendingDate.gte = new Date(startDate as string);
            if (endDate) where.spendingDate.lte = new Date(endDate as string);
        }

        const records = await prisma.spendingRecord.groupBy({
            by: ['spendingDate'],
            where,
            _sum: { amount: true },
            orderBy: { spendingDate: 'desc' },
        });

        const totalSum = await prisma.spendingRecord.aggregate({
            where,
            _sum: { amount: true },
        });

        res.json({
            dailySpending: records,
            totalSpending: totalSum._sum.amount || 0,
        });
    } catch (error) {
        console.error('Get batch summary error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/spending/account/:id/chart - Get chart data for account
router.get('/account/:id/chart', authenticateToken, canView, async (req: AuthRequest, res: Response) => {
    try {
        const { startDate, endDate } = req.query;

        // Default to 7 days if no dates provided
        const end = endDate ? new Date(endDate as string) : new Date();
        const start = startDate
            ? new Date(startDate as string)
            : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

        const records = await prisma.spendingRecord.findMany({
            where: {
                accountId: req.params.id as string,
                spendingDate: {
                    gte: start,
                    lte: end,
                },
            },
            orderBy: [
                { spendingDate: 'asc' },
                { createdAt: 'asc' }
            ],
            select: {
                spendingDate: true,
                amount: true,
                currency: true,
                createdAt: true,
                invoiceMcc: {
                    select: { id: true, name: true }
                },
                customer: {
                    select: { id: true, name: true }
                },
            },
        });

        // Build chart data with MI/MC info
        // Return all records to support multiple snapshots per day
        const chartData = records.map(r => ({
            date: r.spendingDate.toISOString().split('T')[0],
            amount: Number(r.amount),
            miName: r.invoiceMcc?.name || null,
            mcName: r.customer?.name || null,
            createdAt: r.createdAt.toISOString(),
        }));

        // Calculate totals
        const totalAmount = chartData.reduce((sum, d) => sum + d.amount, 0);

        res.json({
            startDate: start.toISOString().split('T')[0],
            endDate: end.toISOString().split('T')[0],
            data: chartData,
            totalAmount,
            currency: records[0]?.currency || 'USD',
        });
    } catch (error) {
        console.error('Get account chart error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/spending/chart - Get global chart data
router.get('/chart', authenticateToken, canView, async (req: AuthRequest, res: Response) => {
    try {
        const { startDate, endDate } = req.query;

        // Default to 30 days if no dates provided
        const end = endDate ? new Date(endDate as string) : new Date();
        const start = startDate
            ? new Date(startDate as string)
            : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

        const records = await prisma.spendingRecord.groupBy({
            by: ['spendingDate'],
            where: {
                spendingDate: {
                    gte: start,
                    lte: end,
                },
            },
            _sum: { amount: true },
            orderBy: { spendingDate: 'asc' },
        });

        // Fill in missing dates with 0
        const chartData = [];
        const currentDate = new Date(start);
        while (currentDate <= end) {
            const dateStr = currentDate.toISOString().split('T')[0];
            const record = records.find(r => r.spendingDate.toISOString().split('T')[0] === dateStr);

            chartData.push({
                date: dateStr,
                amount: Number(record?._sum.amount || 0),
            });

            currentDate.setDate(currentDate.getDate() + 1);
        }

        const totalAmount = chartData.reduce((sum, d) => sum + d.amount, 0);

        res.json({
            startDate: start.toISOString().split('T')[0],
            endDate: end.toISOString().split('T')[0],
            data: chartData,
            totalAmount,
            currency: 'USD', // Assuming USD for now or mixed
        });
    } catch (error) {
        console.error('Get global chart error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
