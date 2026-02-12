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
// GET /api/customers - List all customers (MC)
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
            name: { contains: search, mode: 'insensitive' },
        } : {};
        const [customers, total] = await Promise.all([
            database_1.default.customer.findMany({
                where,
                include: {
                    assignedStaff: { select: { id: true, fullName: true } },
                    _count: { select: { accounts: true } },
                    spendingRecords: {
                        where: {
                            spendingDate: { gte: startDate }
                        },
                        select: { amount: true }
                    }
                },
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            database_1.default.customer.count({ where }),
        ]);
        const data = customers.map(customer => {
            const rangeSpending = customer.spendingRecords.reduce((sum, record) => sum + Number(record.amount), 0);
            const { spendingRecords, ...rest } = customer;
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
        console.error('Get customers error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/customers - Create customer (MC)
router.post('/', auth_middleware_1.authenticateToken, auth_middleware_1.isAssigner, async (req, res) => {
    try {
        const validation = validators_1.createCustomerSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({ error: validation.error.errors });
            return;
        }
        // Check if customer name already exists
        const existing = await database_1.default.customer.findUnique({
            where: { name: validation.data.name },
        });
        if (existing) {
            res.status(409).json({ error: 'Customer name already exists' });
            return;
        }
        const customer = await database_1.default.customer.create({ data: validation.data });
        await (0, activityLogger_1.default)({
            userId: req.user.id,
            action: 'CREATE',
            entityType: 'Customer',
            entityId: customer.id,
            newValues: validation.data,
            description: `Tạo Khách hàng ${customer.name}`,
            ipAddress: req.ip,
        });
        res.status(201).json(customer);
    }
    catch (error) {
        console.error('Create customer error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/customers/:id
router.get('/:id', auth_middleware_1.authenticateToken, auth_middleware_1.canView, async (req, res) => {
    try {
        const customer = await database_1.default.customer.findUnique({
            where: { id: req.params.id },
            include: {
                assignedStaff: { select: { id: true, fullName: true, email: true } },
                accounts: {
                    select: {
                        id: true,
                        googleAccountId: true,
                        accountName: true,
                        status: true,
                        currency: true,
                        totalSpending: true,
                        currentMi: { select: { id: true, name: true } },
                    },
                },
            },
        });
        if (!customer) {
            res.status(404).json({ error: 'Customer not found' });
            return;
        }
        res.json(customer);
    }
    catch (error) {
        console.error('Get customer error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// PUT /api/customers/:id
router.put('/:id', auth_middleware_1.authenticateToken, auth_middleware_1.isAssigner, async (req, res) => {
    try {
        const existing = await database_1.default.customer.findUnique({ where: { id: req.params.id } });
        if (!existing) {
            res.status(404).json({ error: 'Customer not found' });
            return;
        }
        const { name, contactInfo, status, assignedStaffId, notes } = req.body;
        const customer = await database_1.default.customer.update({
            where: { id: req.params.id },
            data: { name, contactInfo, status, assignedStaffId, notes },
        });
        await (0, activityLogger_1.default)({
            userId: req.user.id,
            action: 'UPDATE',
            entityType: 'Customer',
            entityId: customer.id,
            oldValues: existing,
            newValues: customer,
            description: `Cập nhật Khách hàng ${customer.name}`,
            ipAddress: req.ip,
        });
        res.json(customer);
    }
    catch (error) {
        console.error('Update customer error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// DELETE /api/customers/:id
router.delete('/:id', auth_middleware_1.authenticateToken, auth_middleware_1.isAssigner, async (req, res) => {
    try {
        const existing = await database_1.default.customer.findUnique({
            where: { id: req.params.id },
            include: {
                _count: {
                    select: { accounts: true },
                },
            },
        });
        if (!existing) {
            res.status(404).json({ error: 'Customer not found' });
            return;
        }
        if (existing._count.accounts > 0) {
            res.status(400).json({
                error: 'Cannot delete Customer with linked accounts',
            });
            return;
        }
        await database_1.default.customer.delete({ where: { id: req.params.id } });
        await (0, activityLogger_1.default)({
            userId: req.user.id,
            action: 'DELETE',
            entityType: 'Customer',
            entityId: existing.id,
            description: `Xóa Khách hàng ${existing.name}`,
            ipAddress: req.ip,
        });
        res.json({ message: 'Customer deleted successfully' });
    }
    catch (error) {
        console.error('Delete customer error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/customers/:id/assign-accounts - Assign accounts to customer
router.post('/:id/assign-accounts', auth_middleware_1.authenticateToken, auth_middleware_1.isAssigner, async (req, res) => {
    try {
        const customer = await database_1.default.customer.findUnique({ where: { id: req.params.id } });
        if (!customer) {
            res.status(404).json({ error: 'Customer not found' });
            return;
        }
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
            if (!account)
                continue;
            // If already assigned to another customer, create unassign history
            let oldCustomerName = '';
            let oldValues = undefined;
            if (account.currentMcId && account.currentMcId !== customer.id) {
                oldCustomerName = account.currentMc?.name || '';
                oldValues = {
                    customerId: account.currentMcId,
                    customerName: oldCustomerName
                };
                await database_1.default.accountMCHistory.updateMany({
                    where: {
                        accountId: accountId,
                        customerId: account.currentMcId,
                        unassignedAt: null,
                    },
                    data: {
                        unassignedAt: now,
                        unassignedById: req.user.id,
                        reason: 'REASSIGN',
                    },
                });
            }
            // Create new MC history
            await database_1.default.accountMCHistory.create({
                data: {
                    accountId,
                    customerId: customer.id,
                    assignedAt: now,
                    assignedById: req.user.id,
                    reason: account.currentMcId ? 'REASSIGN' : 'INITIAL',
                },
            });
            // Update account current MC
            await database_1.default.account.update({
                where: { id: accountId },
                data: { currentMcId: customer.id },
            });
            results.push(accountId);
            const description = oldCustomerName
                ? `Thay đổi MC cho tài khoản ${account.googleAccountId} từ ${oldCustomerName} sang ${customer.name}`
                : `Gán tài khoản ${account.googleAccountId} cho khách hàng ${customer.name}`;
            await (0, activityLogger_1.default)({
                userId: req.user.id,
                action: 'ASSIGN_MC',
                entityType: 'Account',
                entityId: accountId,
                oldValues,
                newValues: {
                    customerId: customer.id,
                    customerName: customer.name
                },
                description,
                ipAddress: req.ip,
            });
        }
        // Update customer counts
        await database_1.default.customer.update({
            where: { id: customer.id },
            data: {
                totalAccounts: { increment: results.length },
                activeAccounts: { increment: results.length },
            },
        });
        res.json({ message: `Assigned ${results.length} accounts`, assignedAccountIds: results });
    }
    catch (error) {
        console.error('Assign accounts error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
//# sourceMappingURL=customer.routes.js.map