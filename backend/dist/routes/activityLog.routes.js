"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../config/database"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const validators_1 = require("../utils/validators");
const router = (0, express_1.Router)();
// GET /api/activity-logs - List activity logs
router.get('/', auth_middleware_1.authenticateToken, auth_middleware_1.canView, async (req, res) => {
    try {
        const query = validators_1.paginationSchema.safeParse(req.query);
        const { page, limit } = query.success ? query.data : { page: 1, limit: 50 };
        const { userId, entityType, action, startDate, endDate } = req.query;
        const where = {};
        if (userId)
            where.userId = userId;
        if (entityType)
            where.entityType = entityType;
        if (action)
            where.action = action;
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate)
                where.createdAt.gte = new Date(startDate);
            if (endDate)
                where.createdAt.lte = new Date(endDate);
        }
        const [logs, total] = await Promise.all([
            database_1.default.activityLog.findMany({
                where,
                include: {
                    user: { select: { id: true, fullName: true, email: true } },
                },
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            database_1.default.activityLog.count({ where }),
        ]);
        res.json({
            data: logs,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (error) {
        console.error('Get activity logs error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/activity-logs/:id - Get specific activity log
router.get('/:id', auth_middleware_1.authenticateToken, auth_middleware_1.canView, async (req, res) => {
    try {
        const id = req.params.id;
        // Check if id is valid uuid to avoid errors with other routes like 'stats'
        if (!id.match(/^[0-9a-fA-F-]{36}$/)) {
            return res.status(404).json({ error: 'Activity log not found' });
        }
        const log = await database_1.default.activityLog.findUnique({
            where: { id },
            include: {
                user: { select: { id: true, fullName: true, email: true } },
            },
        });
        if (!log) {
            return res.status(404).json({ error: 'Activity log not found' });
        }
        res.json(log);
    }
    catch (error) {
        console.error('Get activity log error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/activity-logs/entity/:type/:id - Get logs for specific entity
router.get('/entity/:type/:id', auth_middleware_1.authenticateToken, auth_middleware_1.canView, async (req, res) => {
    try {
        const type = req.params.type;
        const id = req.params.id;
        const logs = await database_1.default.activityLog.findMany({
            where: {
                entityType: type,
                entityId: id,
            },
            include: {
                user: { select: { id: true, fullName: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });
        res.json(logs);
    }
    catch (error) {
        console.error('Get entity logs error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/activity-logs/stats - Get activity statistics (admin only)
router.get('/stats', auth_middleware_1.authenticateToken, auth_middleware_1.isAdmin, async (req, res) => {
    try {
        const { days = '7' } = req.query;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));
        const [byAction, byEntityType, byUser, totalCount] = await Promise.all([
            database_1.default.activityLog.groupBy({
                by: ['action'],
                where: { createdAt: { gte: startDate } },
                _count: true,
            }),
            database_1.default.activityLog.groupBy({
                by: ['entityType'],
                where: { createdAt: { gte: startDate } },
                _count: true,
            }),
            database_1.default.activityLog.groupBy({
                by: ['userId'],
                where: { createdAt: { gte: startDate } },
                _count: true,
                orderBy: { _count: { userId: 'desc' } },
                take: 10,
            }),
            database_1.default.activityLog.count({
                where: { createdAt: { gte: startDate } },
            }),
        ]);
        // Get user details for top users
        const userIds = byUser.map((u) => u.userId);
        const users = await database_1.default.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, fullName: true },
        });
        const userMap = new Map(users.map((u) => [u.id, u.fullName]));
        res.json({
            period: `Last ${days} days`,
            totalActions: totalCount,
            byAction: byAction.map((a) => ({ action: a.action, count: a._count })),
            byEntityType: byEntityType.map((e) => ({ entityType: e.entityType, count: e._count })),
            topUsers: byUser.map((u) => ({
                userId: u.userId,
                userName: userMap.get(u.userId) || 'Unknown',
                count: u._count,
            })),
        });
    }
    catch (error) {
        console.error('Get activity stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
//# sourceMappingURL=activityLog.routes.js.map