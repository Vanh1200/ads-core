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
// GET /api/accounts - List all accounts
router.get('/', auth_middleware_1.authenticateToken, auth_middleware_1.canView, async (req, res) => {
    try {
        const query = validators_1.paginationSchema.safeParse(req.query);
        const { page, limit, search } = query.success ? query.data : { page: 1, limit: 20, search: undefined };
        const { status, batchId, miId, mcId, sortBy, sortOrder, ids, spendingDays } = req.query;
        const conditions = [];
        // Calculate spending date range
        let spendingStart = new Date();
        spendingStart.setHours(0, 0, 0, 0);
        if (spendingDays) {
            const days = parseInt(spendingDays);
            if (!isNaN(days) && days > 1) {
                spendingStart.setDate(spendingStart.getDate() - (days - 1));
            }
        }
        if (search) {
            conditions.push({
                OR: [
                    { googleAccountId: { contains: search, mode: 'insensitive' } },
                    { accountName: { contains: search, mode: 'insensitive' } },
                ]
            });
        }
        if (status)
            conditions.push({ status: status });
        if (batchId)
            conditions.push({ batchId: batchId });
        if (miId)
            conditions.push({ currentMiId: miId });
        if (mcId)
            conditions.push({ currentMcId: mcId });
        if (ids) {
            const idList = Array.isArray(ids) ? ids : ids.split(',').map(s => s.trim()).filter(Boolean);
            if (idList.length > 0) {
                conditions.push({
                    OR: [
                        { googleAccountId: { in: idList } },
                        { id: { in: idList } }
                    ]
                });
            }
        }
        const where = conditions.length > 0 ? { AND: conditions } : {};
        // Build orderBy based on sortBy and sortOrder
        const validSortFields = ['googleAccountId', 'accountName', 'status', 'currency', 'createdAt', 'totalSpending'];
        const field = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
        const order = sortOrder === 'asc' || sortOrder === 'desc' ? sortOrder : 'desc';
        const orderBy = { [field]: order };
        const [accounts, total] = await Promise.all([
            database_1.default.account.findMany({
                where,
                include: {
                    batch: { select: { id: true, name: true } },
                    currentMi: { select: { id: true, name: true, mccInvoiceId: true } },
                    currentMc: { select: { id: true, name: true } },
                    spendingRecords: {
                        where: { spendingDate: { gte: spendingStart } },
                        select: { amount: true }
                    }
                },
                skip: (page - 1) * limit,
                take: limit,
                orderBy,
            }),
            database_1.default.account.count({ where }),
        ]);
        const accountsWithSpending = accounts.map(acc => ({
            ...acc,
            rangeSpending: acc.spendingRecords.reduce((sum, r) => sum + Number(r.amount), 0),
            spendingRecords: undefined // remove heavy list
        }));
        res.json({
            data: accountsWithSpending,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (error) {
        console.error('Get accounts error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/accounts/unlinked - Get accounts not linked to MI
router.get('/unlinked', auth_middleware_1.authenticateToken, auth_middleware_1.canView, async (req, res) => {
    try {
        const accounts = await database_1.default.account.findMany({
            where: { currentMiId: null, status: 'ACTIVE' },
            include: {
                batch: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(accounts);
    }
    catch (error) {
        console.error('Get unlinked accounts error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/accounts/unassigned - Get accounts not assigned to MC
router.get('/unassigned', auth_middleware_1.authenticateToken, auth_middleware_1.canView, async (req, res) => {
    try {
        const accounts = await database_1.default.account.findMany({
            where: { currentMcId: null, status: 'ACTIVE' },
            include: {
                batch: { select: { id: true, name: true } },
                currentMi: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(accounts);
    }
    catch (error) {
        console.error('Get unassigned accounts error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/accounts - Create account
router.post('/', auth_middleware_1.authenticateToken, auth_middleware_1.isBuyer, async (req, res) => {
    try {
        const validation = validators_1.createAccountSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({ error: validation.error.errors });
            return;
        }
        // Check if account ID already exists
        const existing = await database_1.default.account.findUnique({
            where: { googleAccountId: validation.data.googleAccountId },
        });
        if (existing) {
            res.status(409).json({ error: 'Account ID already exists' });
            return;
        }
        const account = await database_1.default.account.create({
            data: validation.data,
            include: {
                batch: { select: { id: true, name: true } },
            },
        });
        // Update batch counts
        await database_1.default.accountBatch.update({
            where: { id: validation.data.batchId },
            data: {
                totalAccounts: { increment: 1 },
                liveAccounts: { increment: 1 },
            },
        });
        await (0, activityLogger_1.default)({
            userId: req.user.id,
            action: 'CREATE',
            entityType: 'Account',
            entityId: account.id,
            newValues: validation.data,
            description: `Tạo tài khoản ${account.googleAccountId}`,
            ipAddress: req.ip,
        });
        res.status(201).json(account);
    }
    catch (error) {
        console.error('Create account error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/accounts/:id
router.get('/:id', auth_middleware_1.authenticateToken, auth_middleware_1.canView, async (req, res) => {
    try {
        const account = await database_1.default.account.findUnique({
            where: { id: req.params.id },
            include: {
                batch: true,
                currentMi: true,
                currentMc: true,
                miHistories: {
                    include: {
                        invoiceMcc: { select: { id: true, name: true, mccInvoiceId: true } },
                        linkedBy: { select: { id: true, fullName: true } },
                        unlinkedBy: { select: { id: true, fullName: true } },
                    },
                    orderBy: { linkedAt: 'desc' },
                },
                mcHistories: {
                    include: {
                        customer: { select: { id: true, name: true } },
                        assignedBy: { select: { id: true, fullName: true } },
                        unassignedBy: { select: { id: true, fullName: true } },
                    },
                    orderBy: { assignedAt: 'desc' },
                },
                snapshots: {
                    orderBy: { snapshotAt: 'desc' },
                    take: 10,
                },
            },
        });
        if (!account) {
            res.status(404).json({ error: 'Account not found' });
            return;
        }
        res.json(account);
    }
    catch (error) {
        console.error('Get account error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// PUT /api/accounts/:id
router.put('/:id', auth_middleware_1.authenticateToken, auth_middleware_1.isBuyer, async (req, res) => {
    try {
        const existing = await database_1.default.account.findUnique({ where: { id: req.params.id } });
        if (!existing) {
            res.status(404).json({ error: 'Account not found' });
            return;
        }
        const { accountName, status, currency, timezone } = req.body;
        const account = await database_1.default.account.update({
            where: { id: req.params.id },
            data: { accountName, status, currency, timezone },
        });
        // Update batch counts if status changed
        if (status && status !== existing.status) {
            if (status === 'DIED' && existing.status !== 'DIED') {
                await database_1.default.accountBatch.update({
                    where: { id: existing.batchId },
                    data: { liveAccounts: { decrement: 1 }, diedAccounts: { increment: 1 } },
                });
            }
            else if (status !== 'DIED' && existing.status === 'DIED') {
                await database_1.default.accountBatch.update({
                    where: { id: existing.batchId },
                    data: { liveAccounts: { increment: 1 }, diedAccounts: { decrement: 1 } },
                });
            }
        }
        await (0, activityLogger_1.default)({
            userId: req.user.id,
            action: 'UPDATE',
            entityType: 'Account',
            entityId: account.id,
            oldValues: existing,
            newValues: account,
            description: `Cập nhật tài khoản ${account.googleAccountId}`,
            ipAddress: req.ip,
        });
        res.json(account);
    }
    catch (error) {
        console.error('Update account error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/accounts/bulk-update-status
router.post('/bulk-update-status', auth_middleware_1.authenticateToken, auth_middleware_1.isBuyer, async (req, res) => {
    try {
        const { accountIds, status } = req.body;
        if (!Array.isArray(accountIds) || accountIds.length === 0 || !status) {
            res.status(400).json({ error: 'Account IDs and status required' });
            return;
        }
        const validStatuses = ['ACTIVE', 'INACTIVE', 'DIED'];
        if (!validStatuses.includes(status)) {
            res.status(400).json({ error: 'Invalid status' });
            return;
        }
        const results = [];
        for (const accountId of accountIds) {
            const existing = await database_1.default.account.findUnique({ where: { id: accountId } });
            if (!existing)
                continue;
            const account = await database_1.default.account.update({
                where: { id: accountId },
                data: { status },
            });
            // Update batch counts if status changed
            if (status !== existing.status) {
                if (status === 'DIED' && existing.status !== 'DIED') {
                    await database_1.default.accountBatch.update({
                        where: { id: existing.batchId },
                        data: { liveAccounts: { decrement: 1 }, diedAccounts: { increment: 1 } },
                    });
                }
                else if (status !== 'DIED' && existing.status === 'DIED') {
                    await database_1.default.accountBatch.update({
                        where: { id: existing.batchId },
                        data: { liveAccounts: { increment: 1 }, diedAccounts: { decrement: 1 } },
                    });
                }
            }
            await (0, activityLogger_1.default)({
                userId: req.user.id,
                action: 'UPDATE',
                entityType: 'Account',
                entityId: account.id,
                oldValues: { status: existing.status },
                newValues: { status: account.status },
                description: `Cập nhật trạng thái tài khoản ${account.googleAccountId} thành ${status}`,
                ipAddress: req.ip,
            });
            results.push(accountId);
        }
        res.json({ message: `Updated ${results.length} accounts`, updatedAccountIds: results });
    }
    catch (error) {
        console.error('Bulk update status error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/accounts/bulk-unlink-mi
router.post('/bulk-unlink-mi', auth_middleware_1.authenticateToken, auth_middleware_1.isLinker, async (req, res) => {
    try {
        const { accountIds } = req.body;
        if (!Array.isArray(accountIds) || accountIds.length === 0) {
            res.status(400).json({ error: 'Account IDs required' });
            return;
        }
        const now = new Date();
        const results = [];
        for (const accountId of accountIds) {
            const account = await database_1.default.account.findUnique({
                where: { id: accountId },
                include: { currentMi: true }
            });
            if (!account || !account.currentMiId)
                continue;
            // Update history
            await database_1.default.accountMIHistory.updateMany({
                where: {
                    accountId: accountId,
                    invoiceMccId: account.currentMiId,
                    unlinkedAt: null,
                },
                data: {
                    unlinkedAt: now,
                    unlinkedById: req.user.id,
                    reason: 'MIGRATION', // Or manual unlink
                },
            });
            // Update account
            await database_1.default.account.update({
                where: { id: accountId },
                data: { currentMiId: null },
            });
            // Update MI counts
            await database_1.default.invoiceMCC.update({
                where: { id: account.currentMiId },
                data: { linkedAccountsCount: { decrement: 1 } },
            });
            await (0, activityLogger_1.default)({
                userId: req.user.id,
                action: 'UNLINK_MI',
                entityType: 'Account',
                entityId: accountId,
                oldValues: { invoiceMccId: account.currentMiId, invoiceMccName: account.currentMi?.name },
                description: `Gỡ MI khỏi tài khoản ${account.googleAccountId}`,
                ipAddress: req.ip,
            });
            results.push(accountId);
        }
        res.json({ message: `Unlinked ${results.length} accounts`, unlinkedAccountIds: results });
    }
    catch (error) {
        console.error('Bulk unlink MI error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/accounts/bulk-unassign-mc
router.post('/bulk-unassign-mc', auth_middleware_1.authenticateToken, auth_middleware_1.isAssigner, async (req, res) => {
    try {
        const { accountIds } = req.body;
        if (!Array.isArray(accountIds) || accountIds.length === 0) {
            res.status(400).json({ error: 'Account IDs required' });
            return;
        }
        const now = new Date();
        const results = [];
        for (const accountId of accountIds) {
            const account = await database_1.default.account.findUnique({
                where: { id: accountId },
                include: { currentMc: true }
            });
            if (!account || !account.currentMcId)
                continue;
            // Update history
            await database_1.default.accountMCHistory.updateMany({
                where: {
                    accountId: accountId,
                    customerId: account.currentMcId,
                    unassignedAt: null,
                },
                data: {
                    unassignedAt: now,
                    unassignedById: req.user.id,
                    reason: 'REASSIGN', // Or manual unassign
                },
            });
            // Update account
            await database_1.default.account.update({
                where: { id: accountId },
                data: { currentMcId: null },
            });
            // Update Customer counts
            await database_1.default.customer.update({
                where: { id: account.currentMcId },
                data: {
                    totalAccounts: { decrement: 1 },
                    activeAccounts: { decrement: 1 },
                },
            });
            await (0, activityLogger_1.default)({
                userId: req.user.id,
                action: 'UNASSIGN_MC',
                entityType: 'Account',
                entityId: accountId,
                oldValues: { customerId: account.currentMcId, customerName: account.currentMc?.name },
                description: `Gỡ khách hàng khỏi tài khoản ${account.googleAccountId}`,
                ipAddress: req.ip,
            });
            results.push(accountId);
        }
        res.json({ message: `Unassigned ${results.length} accounts`, unassignedAccountIds: results });
    }
    catch (error) {
        console.error('Bulk unassign MC error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
//# sourceMappingURL=account.routes.js.map