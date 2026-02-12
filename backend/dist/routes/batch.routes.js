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
const router = (0, express_1.Router)();
// GET /api/batches - List all batches (MA)
router.get('/', auth_middleware_1.authenticateToken, auth_middleware_1.canView, async (req, res) => {
    try {
        const validation = validators_1.paginationSchema.safeParse(req.query);
        const { page, limit } = validation.success ? validation.data : { page: 1, limit: 20 };
        const { search, spendingDays } = req.query;
        const days = spendingDays ? parseInt(spendingDays) : 1;
        const startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        startDate.setDate(startDate.getDate() - (days - 1));
        const where = search ? {
            OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { mccAccountName: { contains: search, mode: 'insensitive' } },
                { mccAccountId: { contains: search, mode: 'insensitive' } },
            ],
        } : {};
        const [batches, total] = await Promise.all([
            database_1.default.accountBatch.findMany({
                where,
                include: {
                    partner: { select: { id: true, name: true } },
                    createdBy: { select: { id: true, fullName: true } },
                    _count: { select: { accounts: true } },
                    accounts: {
                        select: {
                            spendingRecords: {
                                where: {
                                    spendingDate: { gte: startDate }
                                },
                                select: { amount: true }
                            }
                        }
                    }
                },
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            database_1.default.accountBatch.count({ where }),
        ]);
        // Calculate range spending for each batch
        const data = batches.map(batch => {
            const rangeSpending = batch.accounts.reduce((sum, account) => {
                const accountSpending = account.spendingRecords.reduce((aSum, record) => aSum + Number(record.amount), 0);
                return sum + accountSpending;
            }, 0);
            // Remove accounts from response to keep it small
            const { accounts, ...rest } = batch;
            return {
                ...rest,
                rangeSpending
            };
        });
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
            description: `Tạo Lô tài khoản ${batch.name}`,
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
        const { name, mccAccountName, mccAccountId, partnerId, status, notes } = req.body;
        const batch = await database_1.default.accountBatch.update({
            where: { id: req.params.id },
            data: { name, mccAccountName, mccAccountId, partnerId, status, notes },
        });
        await (0, activityLogger_1.default)({
            userId: req.user.id,
            action: 'UPDATE',
            entityType: 'AccountBatch',
            entityId: batch.id,
            oldValues: existing,
            newValues: batch,
            description: `Cập nhật Lô tài khoản ${batch.name}`,
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
            description: `Xóa Lô tài khoản ${existing.name}`,
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