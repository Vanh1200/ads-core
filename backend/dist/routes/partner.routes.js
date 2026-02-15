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
// GET /api/partners - List all partners
router.get('/', auth_middleware_1.authenticateToken, auth_middleware_1.canView, async (req, res) => {
    try {
        const query = validators_1.paginationSchema.safeParse(req.query);
        const { page, limit, search } = query.success ? query.data : { page: 1, limit: 20, search: undefined };
        const where = search ? {
            name: { contains: search, mode: 'insensitive' },
        } : {};
        const [partners, total] = await Promise.all([
            database_1.default.partner.findMany({
                where,
                include: {
                    _count: {
                        select: { batches: true, invoiceMCCs: true },
                    },
                },
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            database_1.default.partner.count({ where }),
        ]);
        res.json({
            data: partners,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (error) {
        console.error('Get partners error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/partners - Create partner
router.post('/', auth_middleware_1.authenticateToken, auth_middleware_1.isBuyer, async (req, res) => {
    try {
        const validation = validators_1.createPartnerSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({ error: validation.error.errors });
            return;
        }
        const partner = await database_1.default.partner.create({ data: validation.data });
        await (0, activityLogger_1.default)({
            userId: req.user.id,
            action: 'CREATE',
            entityType: 'Partner',
            entityId: partner.id,
            newValues: validation.data,
            description: `Tạo Đối tác ${partner.name}`,
            ipAddress: req.ip,
        });
        res.status(201).json(partner);
    }
    catch (error) {
        console.error('Create partner error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/partners/:id
router.get('/:id', auth_middleware_1.authenticateToken, auth_middleware_1.canView, async (req, res) => {
    try {
        const partner = await database_1.default.partner.findUnique({
            where: { id: req.params.id },
            include: {
                batches: { select: { id: true, mccAccountName: true, status: true } },
                invoiceMCCs: { select: { id: true, name: true, mccInvoiceId: true, status: true } },
            },
        });
        if (!partner) {
            res.status(404).json({ error: 'Partner not found' });
            return;
        }
        res.json(partner);
    }
    catch (error) {
        console.error('Get partner error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// PUT /api/partners/:id
router.put('/:id', auth_middleware_1.authenticateToken, auth_middleware_1.isBuyer, async (req, res) => {
    try {
        const existing = await database_1.default.partner.findUnique({ where: { id: req.params.id } });
        if (!existing) {
            res.status(404).json({ error: 'Partner not found' });
            return;
        }
        const { name, contactInfo, type, notes } = req.body;
        const partner = await database_1.default.partner.update({
            where: { id: req.params.id },
            data: { name, contactInfo, type, notes },
        });
        await (0, activityLogger_1.default)({
            userId: req.user.id,
            action: 'UPDATE',
            entityType: 'Partner',
            entityId: partner.id,
            oldValues: existing,
            newValues: partner,
            description: `Cập nhật Đối tác ${partner.name}`,
            ipAddress: req.ip,
        });
        res.json(partner);
    }
    catch (error) {
        console.error('Update partner error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// DELETE /api/partners/:id
router.delete('/:id', auth_middleware_1.authenticateToken, auth_middleware_1.isBuyer, async (req, res) => {
    try {
        const existing = await database_1.default.partner.findUnique({
            where: { id: req.params.id },
            include: {
                _count: {
                    select: { batches: true, invoiceMCCs: true },
                },
            },
        });
        if (!existing) {
            res.status(404).json({ error: 'Partner not found' });
            return;
        }
        if (existing._count.batches > 0 || existing._count.invoiceMCCs > 0) {
            res.status(400).json({
                error: 'Cannot delete partner with linked Batches or Invoice MCCs',
            });
            return;
        }
        await database_1.default.partner.delete({ where: { id: req.params.id } });
        await (0, activityLogger_1.default)({
            userId: req.user.id,
            action: 'DELETE',
            entityType: 'Partner',
            entityId: existing.id,
            description: `Xóa Đối tác ${existing.name}`,
            ipAddress: req.ip,
        });
        res.json({ message: 'Partner deleted successfully' });
    }
    catch (error) {
        console.error('Delete partner error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
//# sourceMappingURL=partner.routes.js.map