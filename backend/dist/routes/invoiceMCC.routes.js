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
// GET /api/invoice-mccs - List all Invoice MCCs (MI)
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
                { mccInvoiceId: { contains: search, mode: 'insensitive' } },
            ],
        } : {};
        const [invoiceMCCs, total] = await Promise.all([
            database_1.default.invoiceMCC.findMany({
                where,
                include: {
                    partner: { select: { id: true, name: true } },
                    createdBy: { select: { id: true, fullName: true } },
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
            database_1.default.invoiceMCC.count({ where }),
        ]);
        const data = invoiceMCCs.map(mi => {
            const rangeSpending = mi.spendingRecords.reduce((sum, record) => sum + Number(record.amount), 0);
            const { spendingRecords, ...rest } = mi;
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
        console.error('Get invoice MCCs error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/invoice-mccs - Create Invoice MCC (MI)
router.post('/', auth_middleware_1.authenticateToken, auth_middleware_1.isLinker, async (req, res) => {
    try {
        const validation = validators_1.createInvoiceMCCSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({ error: validation.error.errors });
            return;
        }
        // Check if MCC Invoice ID already exists
        const existing = await database_1.default.invoiceMCC.findUnique({
            where: { mccInvoiceId: validation.data.mccInvoiceId },
        });
        if (existing) {
            res.status(409).json({ error: 'MCC Invoice ID already exists' });
            return;
        }
        const invoiceMCC = await database_1.default.invoiceMCC.create({
            data: {
                ...validation.data,
                createdById: req.user.id,
            },
        });
        await (0, activityLogger_1.default)({
            userId: req.user.id,
            action: 'CREATE',
            entityType: 'InvoiceMCC',
            entityId: invoiceMCC.id,
            newValues: validation.data,
            description: `Tạo Invoice MCC ${invoiceMCC.name}`,
            ipAddress: req.ip,
        });
        res.status(201).json(invoiceMCC);
    }
    catch (error) {
        console.error('Create invoice MCC error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/invoice-mccs/:id
router.get('/:id', auth_middleware_1.authenticateToken, auth_middleware_1.canView, async (req, res) => {
    try {
        const invoiceMCC = await database_1.default.invoiceMCC.findUnique({
            where: { id: req.params.id },
            include: {
                partner: true,
                createdBy: { select: { id: true, fullName: true } },
                accounts: {
                    select: {
                        id: true,
                        googleAccountId: true,
                        accountName: true,
                        status: true,
                        totalSpending: true,
                    },
                },
            },
        });
        if (!invoiceMCC) {
            res.status(404).json({ error: 'Invoice MCC not found' });
            return;
        }
        res.json(invoiceMCC);
    }
    catch (error) {
        console.error('Get invoice MCC error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// PUT /api/invoice-mccs/:id
router.put('/:id', auth_middleware_1.authenticateToken, auth_middleware_1.isLinker, async (req, res) => {
    try {
        const existing = await database_1.default.invoiceMCC.findUnique({ where: { id: req.params.id } });
        if (!existing) {
            res.status(404).json({ error: 'Invoice MCC not found' });
            return;
        }
        const { name, status, creditStatus, notes, partnerId } = req.body;
        const invoiceMCC = await database_1.default.invoiceMCC.update({
            where: { id: req.params.id },
            data: { name, status, creditStatus, notes, partnerId },
        });
        await (0, activityLogger_1.default)({
            userId: req.user.id,
            action: 'UPDATE',
            entityType: 'InvoiceMCC',
            entityId: invoiceMCC.id,
            oldValues: existing,
            newValues: invoiceMCC,
            description: `Cập nhật Invoice MCC ${invoiceMCC.name}`,
            ipAddress: req.ip,
        });
        res.json(invoiceMCC);
    }
    catch (error) {
        console.error('Update invoice MCC error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// DELETE /api/invoice-mccs/:id
router.delete('/:id', auth_middleware_1.authenticateToken, auth_middleware_1.isLinker, async (req, res) => {
    try {
        const existing = await database_1.default.invoiceMCC.findUnique({
            where: { id: req.params.id },
            include: {
                _count: {
                    select: { accounts: true },
                },
            },
        });
        if (!existing) {
            res.status(404).json({ error: 'Invoice MCC not found' });
            return;
        }
        if (existing._count.accounts > 0) {
            res.status(400).json({
                error: 'Cannot delete Invoice MCC with linked accounts',
            });
            return;
        }
        await database_1.default.invoiceMCC.delete({ where: { id: req.params.id } });
        await (0, activityLogger_1.default)({
            userId: req.user.id,
            action: 'DELETE',
            entityType: 'InvoiceMCC',
            entityId: existing.id,
            description: `Xóa Invoice MCC ${existing.name}`,
            ipAddress: req.ip,
        });
        res.json({ message: 'Invoice MCC deleted successfully' });
    }
    catch (error) {
        console.error('Delete invoice MCC error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/invoice-mccs/:id/link-accounts - Link accounts to MI
router.post('/:id/link-accounts', auth_middleware_1.authenticateToken, auth_middleware_1.isLinker, async (req, res) => {
    try {
        const invoiceMCC = await database_1.default.invoiceMCC.findUnique({ where: { id: req.params.id } });
        if (!invoiceMCC) {
            res.status(404).json({ error: 'Invoice MCC not found' });
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
                include: { currentMi: true }
            });
            if (!account)
                continue;
            // If already linked to another MI, create unlink history
            let oldMiName = '';
            let oldValues = undefined;
            if (account.currentMiId && account.currentMiId !== invoiceMCC.id) {
                oldMiName = account.currentMi?.name || '';
                oldValues = {
                    invoiceMccId: account.currentMiId,
                    invoiceMccName: oldMiName
                };
                await database_1.default.accountMIHistory.updateMany({
                    where: {
                        accountId: accountId,
                        invoiceMccId: account.currentMiId,
                        unlinkedAt: null,
                    },
                    data: {
                        unlinkedAt: now,
                        unlinkedById: req.user.id,
                        reason: 'MIGRATION',
                    },
                });
            }
            // Create new MI history
            await database_1.default.accountMIHistory.create({
                data: {
                    accountId,
                    invoiceMccId: invoiceMCC.id,
                    linkedAt: now,
                    linkedById: req.user.id,
                    reason: account.currentMiId ? 'MIGRATION' : 'INITIAL',
                },
            });
            // Update account current MI
            await database_1.default.account.update({
                where: { id: accountId },
                data: { currentMiId: invoiceMCC.id },
            });
            results.push(accountId);
            const description = oldMiName
                ? `Thay đổi MI cho tài khoản ${account.googleAccountId} từ ${oldMiName} sang ${invoiceMCC.name}`
                : `Gán MI ${invoiceMCC.name} cho tài khoản ${account.googleAccountId}`;
            await (0, activityLogger_1.default)({
                userId: req.user.id,
                action: 'LINK_MI',
                entityType: 'Account',
                entityId: accountId,
                oldValues,
                newValues: {
                    invoiceMccId: invoiceMCC.id,
                    invoiceMccName: invoiceMCC.name
                },
                description,
                ipAddress: req.ip,
            });
        }
        // Update MI counts
        await database_1.default.invoiceMCC.update({
            where: { id: invoiceMCC.id },
            data: {
                linkedAccountsCount: { increment: results.length },
            },
        });
        res.json({ message: `Linked ${results.length} accounts`, linkedAccountIds: results });
    }
    catch (error) {
        console.error('Link accounts error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
//# sourceMappingURL=invoiceMCC.routes.js.map