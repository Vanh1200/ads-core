"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../config/database"));
const client_1 = require("@prisma/client");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validators_1 = require("../utils/validators");
const activityLogger_1 = __importDefault(require("../utils/activityLogger"));
const router = (0, express_1.Router)();
// GET /api/batches - List all batches (MA)
router.get('/', auth_middleware_1.authenticateToken, auth_middleware_1.canView, async (req, res) => {
    try {
        const validation = validators_1.paginationSchema.safeParse(req.query);
        const { page, limit } = validation.success ? validation.data : { page: 1, limit: 20 };
        const { search, spendingDays, timezone, year, status, partnerId, ids, sortBy, sortOrder } = req.query;
        const days = spendingDays ? parseInt(spendingDays) : 7;
        const startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        startDate.setDate(startDate.getDate() - (days - 1));
        const where = {};
        if (search) {
            where.OR = [
                { mccAccountName: { contains: search, mode: 'insensitive' } },
                { mccAccountId: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (ids) {
            const idList = ids.split(',').map(id => id.trim()).filter(Boolean);
            if (idList.length > 0) {
                // If we also have search, we need to combine them with AND
                if (where.OR) {
                    where.AND = [
                        { OR: where.OR },
                        { id: { in: idList } }
                    ];
                    delete where.OR;
                }
                else {
                    where.id = { in: idList };
                }
            }
        }
        if (timezone) {
            where.timezone = timezone;
        }
        if (year) {
            where.year = parseInt(year);
        }
        if (status) {
            where.status = status;
        }
        if (partnerId) {
            where.partnerId = partnerId;
        }
        // Dynamic Sorting
        let orderBy = { createdAt: 'desc' };
        if (sortBy) {
            const order = sortOrder === 'asc' ? 'asc' : 'desc';
            switch (sortBy) {
                case 'mccAccountName':
                    orderBy = { mccAccountName: order };
                    break;
                case 'mccAccountId':
                    orderBy = { mccAccountId: order };
                    break;
                case 'status':
                    orderBy = { status: order };
                    break;
                case 'readiness':
                    orderBy = { readiness: order };
                    break;
                case 'timezone':
                    orderBy = { timezone: order };
                    break;
                case 'year':
                    orderBy = { year: order };
                    break;
                case 'partner':
                    orderBy = { partner: { name: order } };
                    break;
                case 'rangeSpending':
                    // We'll handle this AFTER fetching if we want accurate dynamic sorting,
                    // but for database-level sorting, we can use totalSpending as a proxy if appropriate.
                    // However, to satisfy the UI click, we'll implement in-memory sorting below for small datasets.
                    orderBy = { createdAt: 'desc' };
                    break;
                default:
                    orderBy = { createdAt: 'desc' };
            }
        }
        const [batches, total] = await Promise.all([
            database_1.default.accountBatch.findMany({
                where,
                include: {
                    partner: { select: { id: true, name: true } },
                    createdBy: { select: { id: true, fullName: true } },
                    _count: { select: { accounts: true } },
                },
                skip: (page - 1) * limit,
                take: limit,
                orderBy,
            }),
            database_1.default.accountBatch.count({ where }),
        ]);
        // Optimized Aggregation: Fetch spending sums using a single raw SQL query
        const batchIds = batches.map(b => b.id);
        let rangeSpendingMap = {};
        if (batchIds.length > 0) {
            const spendingAggs = await database_1.default.$queryRaw `
                SELECT a.batch_id as "batchId", SUM(s.amount) as "totalAmount"
                FROM spending_records s
                JOIN accounts a ON s.account_id = a.id
                WHERE a.batch_id IN (${client_1.Prisma.join(batchIds)}) 
                  AND s.spending_date >= ${startDate}
                GROUP BY a.batch_id
            `;
            spendingAggs.forEach(agg => {
                rangeSpendingMap[agg.batchId] = Number(agg.totalAmount || 0);
            });
        }
        const data = batches.map(batch => ({
            ...batch,
            rangeSpending: rangeSpendingMap[batch.id] || 0
        }));
        // Handle in-memory sorting for rangeSpending
        if (sortBy === 'rangeSpending') {
            const order = sortOrder === 'asc' ? 1 : -1;
            data.sort((a, b) => (Number(a.rangeSpending) - Number(b.rangeSpending)) * order);
        }
        res.json({
            data,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (error) {
        console.error('Get batches error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/batches/bulk-update
router.post('/bulk-update', auth_middleware_1.authenticateToken, auth_middleware_1.isBuyer, async (req, res) => {
    try {
        const { ids, status, readiness } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            res.status(400).json({ error: 'Invalid IDs provided' });
            return;
        }
        const updates = {};
        if (status)
            updates.status = status;
        if (readiness !== undefined)
            updates.readiness = readiness;
        if (Object.keys(updates).length === 0) {
            res.status(400).json({ error: 'No updates provided' });
            return;
        }
        // Verify batches exist
        const count = await database_1.default.accountBatch.count({
            where: { id: { in: ids } }
        });
        if (count !== ids.length) {
            // Continue anyway, or strict check? Usually loose is fine for bulk ops, but for safety let's just update found ones.
        }
        const result = await database_1.default.accountBatch.updateMany({
            where: { id: { in: ids } },
            data: updates,
        });
        await (0, activityLogger_1.default)({
            userId: req.user.id,
            action: 'UPDATE',
            entityType: 'AccountBatch',
            entityId: 'BULK', // Special ID for bulk
            newValues: { ids, updates },
            description: `Cập nhật hàng loạt ${result.count} lô tài khoản`,
            ipAddress: req.ip,
        });
        res.json({ message: `Updated ${result.count} batches` });
    }
    catch (error) {
        console.error('Bulk update batch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/batches - Create batch (MA)
router.post('/', auth_middleware_1.authenticateToken, auth_middleware_1.isBuyer, async (req, res) => {
    try {
        const validation = validators_1.createBatchSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({ error: validation.error.errors });
            return;
        }
        const batch = await database_1.default.accountBatch.create({
            data: {
                ...validation.data,
                createdById: req.user.id,
            },
            include: {
                partner: { select: { id: true, name: true } },
            },
        });
        await (0, activityLogger_1.default)({
            userId: req.user.id,
            action: 'CREATE',
            entityType: 'AccountBatch',
            entityId: batch.id,
            newValues: validation.data,
            description: `Tạo Lô tài khoản ${batch.mccAccountName}`,
            ipAddress: req.ip,
        });
        res.status(201).json(batch);
    }
    catch (error) {
        console.error('Create batch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/batches/:id
router.get('/:id', auth_middleware_1.authenticateToken, auth_middleware_1.canView, async (req, res) => {
    try {
        const batch = await database_1.default.accountBatch.findUnique({
            where: { id: req.params.id },
            include: {
                partner: true,
                createdBy: { select: { id: true, fullName: true, email: true } },
                accounts: {
                    select: {
                        id: true,
                        googleAccountId: true,
                        accountName: true,
                        status: true,
                        currency: true,
                        timezone: true,
                        totalSpending: true,
                        currentMi: { select: { id: true, name: true, mccInvoiceId: true } },
                        currentMc: { select: { id: true, name: true } },
                    },
                },
            },
        });
        if (!batch) {
            res.status(404).json({ error: 'Batch not found' });
            return;
        }
        res.json(batch);
    }
    catch (error) {
        console.error('Get batch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// PUT /api/batches/:id
router.put('/:id', auth_middleware_1.authenticateToken, auth_middleware_1.isBuyer, async (req, res) => {
    try {
        const existing = await database_1.default.accountBatch.findUnique({ where: { id: req.params.id } });
        if (!existing) {
            res.status(404).json({ error: 'Batch not found' });
            return;
        }
        const { mccAccountName, mccAccountId, partnerId, status, notes, readiness, timezone, year } = req.body;
        const data = { mccAccountName, mccAccountId, partnerId, status, notes };
        if (readiness !== undefined)
            data.readiness = readiness;
        if (timezone !== undefined)
            data.timezone = timezone;
        if (year !== undefined)
            data.year = year;
        const batch = await database_1.default.accountBatch.update({
            where: { id: req.params.id },
            data,
        });
        await (0, activityLogger_1.default)({
            userId: req.user.id,
            action: 'UPDATE',
            entityType: 'AccountBatch',
            entityId: batch.id,
            oldValues: existing,
            newValues: batch,
            description: `Cập nhật Lô tài khoản ${batch.mccAccountName}`,
            ipAddress: req.ip,
        });
        res.json(batch);
    }
    catch (error) {
        console.error('Update batch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// DELETE /api/batches/:id
router.delete('/:id', auth_middleware_1.authenticateToken, auth_middleware_1.isBuyer, async (req, res) => {
    try {
        const existing = await database_1.default.accountBatch.findUnique({
            where: { id: req.params.id },
            include: {
                _count: {
                    select: { accounts: true },
                },
            },
        });
        if (!existing) {
            res.status(404).json({ error: 'Batch not found' });
            return;
        }
        if (existing._count.accounts > 0) {
            res.status(400).json({
                error: 'Cannot delete Batch with linked accounts',
            });
            return;
        }
        await database_1.default.accountBatch.delete({ where: { id: req.params.id } });
        await (0, activityLogger_1.default)({
            userId: req.user.id,
            action: 'DELETE',
            entityType: 'AccountBatch',
            entityId: existing.id,
            description: `Xóa Lô tài khoản ${existing.mccAccountName}`,
            ipAddress: req.ip,
        });
        res.json({ message: 'Batch deleted successfully' });
    }
    catch (error) {
        console.error('Delete batch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/batches/:id/accounts - Get accounts in batch
router.get('/:id/accounts', auth_middleware_1.authenticateToken, auth_middleware_1.canView, async (req, res) => {
    try {
        const accounts = await database_1.default.account.findMany({
            where: { batchId: req.params.id },
            include: {
                currentMi: { select: { id: true, name: true, mccInvoiceId: true } },
                currentMc: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(accounts);
    }
    catch (error) {
        console.error('Get batch accounts error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
//# sourceMappingURL=batch.routes.js.map