"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../config/database"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const validators_1 = require("../utils/validators");
const activityLogger_1 = __importDefault(require("../utils/activityLogger"));
const library_1 = require("@prisma/client/runtime/library");
const router = (0, express_1.Router)();
// GET /api/spending/snapshots - List all snapshots
router.get('/snapshots', auth_middleware_1.authenticateToken, auth_middleware_1.canView, async (req, res) => {
    try {
        const query = validators_1.paginationSchema.safeParse(req.query);
        const { page, limit } = query.success ? query.data : { page: 1, limit: 50 };
        const { accountId, date } = req.query;
        const where = {};
        if (accountId)
            where.accountId = accountId;
        if (date)
            where.spendingDate = new Date(date);
        const [snapshots, total] = await Promise.all([
            database_1.default.spendingSnapshot.findMany({
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
            database_1.default.spendingSnapshot.count({ where }),
        ]);
        res.json({
            data: snapshots,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (error) {
        console.error('Get snapshots error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/spending/snapshot - Create spending snapshot
router.post('/snapshot', auth_middleware_1.authenticateToken, auth_middleware_1.isUpdater, async (req, res) => {
    try {
        const { accountId, spendingDate, cumulativeAmount, snapshotType } = req.body;
        const account = await database_1.default.account.findUnique({
            where: { id: accountId },
            include: { currentMi: true, currentMc: true },
        });
        if (!account) {
            res.status(404).json({ error: 'Account not found' });
            return;
        }
        const snapshot = await database_1.default.spendingSnapshot.create({
            data: {
                accountId,
                spendingDate: new Date(spendingDate),
                cumulativeAmount,
                snapshotAt: new Date(),
                snapshotType,
                invoiceMccId: account.currentMiId,
                customerId: account.currentMcId,
                createdById: req.user.id,
            },
        });
        await (0, activityLogger_1.default)({
            userId: req.user.id,
            action: 'SNAPSHOT',
            entityType: 'SpendingSnapshot',
            entityId: snapshot.id,
            newValues: { accountId, cumulativeAmount, snapshotType },
            description: `Tạo snapshot ${snapshotType} cho tài khoản ${account.googleAccountId}`,
            ipAddress: req.ip,
        });
        res.status(201).json(snapshot);
    }
    catch (error) {
        console.error('Create snapshot error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/spending/calculate - Calculate spending records from snapshots
router.post('/calculate', auth_middleware_1.authenticateToken, auth_middleware_1.isUpdater, async (req, res) => {
    try {
        const { accountId, spendingDate } = req.body;
        const account = await database_1.default.account.findUnique({ where: { id: accountId } });
        if (!account) {
            res.status(404).json({ error: 'Account not found' });
            return;
        }
        const date = new Date(spendingDate);
        // Get all snapshots for this account on this date, ordered by time
        const snapshots = await database_1.default.spendingSnapshot.findMany({
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
        await database_1.default.spendingRecord.deleteMany({
            where: { accountId, spendingDate: date },
        });
        const records = [];
        let previousCumulative = new library_1.Decimal(0);
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        for (let i = 0; i < snapshots.length; i++) {
            const snapshot = snapshots[i];
            const amount = new library_1.Decimal(snapshot.cumulativeAmount).minus(previousCumulative);
            if (amount.greaterThan(0)) {
                const periodStart = i === 0 ? startOfDay : snapshots[i - 1].snapshotAt;
                const record = await database_1.default.spendingRecord.create({
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
            previousCumulative = new library_1.Decimal(snapshot.cumulativeAmount);
        }
        // Update account total spending
        const totalSpending = await database_1.default.spendingRecord.aggregate({
            where: { accountId },
            _sum: { amount: true },
        });
        await database_1.default.account.update({
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
    }
    catch (error) {
        console.error('Calculate spending error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/spending/records - Get spending records
router.get('/records', auth_middleware_1.authenticateToken, auth_middleware_1.canView, async (req, res) => {
    try {
        const { accountId, miId, mcId, startDate, endDate } = req.query;
        const where = {};
        if (accountId)
            where.accountId = accountId;
        if (miId)
            where.invoiceMccId = miId;
        if (mcId)
            where.customerId = mcId;
        if (startDate || endDate) {
            where.spendingDate = {};
            if (startDate)
                where.spendingDate.gte = new Date(startDate);
            if (endDate)
                where.spendingDate.lte = new Date(endDate);
        }
        const records = await database_1.default.spendingRecord.findMany({
            where,
            include: {
                account: { select: { id: true, googleAccountId: true, accountName: true } },
                invoiceMcc: { select: { id: true, name: true } },
                customer: { select: { id: true, name: true } },
            },
            orderBy: [{ spendingDate: 'desc' }, { periodStart: 'asc' }],
        });
        // Calculate totals
        const totals = await database_1.default.spendingRecord.aggregate({
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
    }
    catch (error) {
        console.error('Get spending records error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/spending/summary/customer/:id
router.get('/summary/customer/:id', auth_middleware_1.authenticateToken, auth_middleware_1.canView, async (req, res) => {
    try {
        const records = await database_1.default.spendingRecord.groupBy({
            by: ['spendingDate'],
            where: { customerId: req.params.id },
            _sum: { amount: true },
            orderBy: { spendingDate: 'desc' },
        });
        const totalSum = await database_1.default.spendingRecord.aggregate({
            where: { customerId: req.params.id },
            _sum: { amount: true },
        });
        res.json({
            dailySpending: records,
            totalSpending: totalSum._sum.amount || 0,
        });
    }
    catch (error) {
        console.error('Get customer summary error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/spending/summary/invoice-mcc/:id
router.get('/summary/invoice-mcc/:id', auth_middleware_1.authenticateToken, auth_middleware_1.canView, async (req, res) => {
    try {
        const records = await database_1.default.spendingRecord.groupBy({
            by: ['spendingDate'],
            where: { invoiceMccId: req.params.id },
            _sum: { amount: true },
            orderBy: { spendingDate: 'desc' },
        });
        const totalSum = await database_1.default.spendingRecord.aggregate({
            where: { invoiceMccId: req.params.id },
            _sum: { amount: true },
        });
        res.json({
            dailySpending: records,
            totalSpending: totalSum._sum.amount || 0,
        });
    }
    catch (error) {
        console.error('Get invoice MCC summary error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/spending/account/:id/chart - Get chart data for account
router.get('/account/:id/chart', auth_middleware_1.authenticateToken, auth_middleware_1.canView, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        // Default to 7 days if no dates provided
        const end = endDate ? new Date(endDate) : new Date();
        const start = startDate
            ? new Date(startDate)
            : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
        const records = await database_1.default.spendingRecord.findMany({
            where: {
                accountId: req.params.id,
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
    }
    catch (error) {
        console.error('Get account chart error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/spending/chart - Get global chart data
router.get('/chart', auth_middleware_1.authenticateToken, auth_middleware_1.canView, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        // Default to 30 days if no dates provided
        const end = endDate ? new Date(endDate) : new Date();
        const start = startDate
            ? new Date(startDate)
            : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
        const records = await database_1.default.spendingRecord.groupBy({
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
    }
    catch (error) {
        console.error('Get global chart error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
//# sourceMappingURL=spending.routes.js.map