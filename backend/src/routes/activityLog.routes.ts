import { Router, Response } from 'express';
import prisma from '../config/database';
import { authenticateToken, AuthRequest, isAdmin, canView } from '../middleware/auth.middleware';
import { paginationSchema } from '../utils/validators';

const router = Router();

// GET /api/activity-logs - List activity logs
router.get('/', authenticateToken, canView, async (req: AuthRequest, res: Response) => {
    try {
        const query = paginationSchema.safeParse(req.query);
        const { page, limit } = query.success ? query.data : { page: 1, limit: 50 };
        const { userId, entityType, action, startDate, endDate } = req.query;

        const where: any = {};
        if (userId) where.userId = userId as string;
        if (entityType) where.entityType = entityType as string;
        if (action) where.action = action as string;
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate as string);
            if (endDate) where.createdAt.lte = new Date(endDate as string);
        }

        const [logs, total] = await Promise.all([
            prisma.activityLog.findMany({
                where,
                include: {
                    user: { select: { id: true, fullName: true, email: true } },
                },
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            prisma.activityLog.count({ where }),
        ]);

        res.json({
            data: logs,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error('Get activity logs error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/activity-logs/:id - Get specific activity log
router.get('/:id', authenticateToken, canView, async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        // Check if id is valid uuid to avoid errors with other routes like 'stats'
        if (!id.match(/^[0-9a-fA-F-]{36}$/)) {
            return res.status(404).json({ error: 'Activity log not found' });
        }

        const log = await prisma.activityLog.findUnique({
            where: { id },
            include: {
                user: { select: { id: true, fullName: true, email: true } },
            },
        });

        if (!log) {
            return res.status(404).json({ error: 'Activity log not found' });
        }

        res.json(log);
    } catch (error) {
        console.error('Get activity log error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/activity-logs/entity/:type/:id - Get logs for specific entity
router.get('/entity/:type/:id', authenticateToken, canView, async (req: AuthRequest, res: Response) => {
    try {
        const type = req.params.type as string;
        const id = req.params.id as string;

        const logs = await prisma.activityLog.findMany({
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
    } catch (error) {
        console.error('Get entity logs error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/activity-logs/stats - Get activity statistics (admin only)
router.get('/stats', authenticateToken, isAdmin, async (req: AuthRequest, res: Response) => {
    try {
        const { days = '7' } = req.query;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days as string));

        const [byAction, byEntityType, byUser, totalCount] = await Promise.all([
            prisma.activityLog.groupBy({
                by: ['action'],
                where: { createdAt: { gte: startDate } },
                _count: true,
            }),
            prisma.activityLog.groupBy({
                by: ['entityType'],
                where: { createdAt: { gte: startDate } },
                _count: true,
            }),
            prisma.activityLog.groupBy({
                by: ['userId'],
                where: { createdAt: { gte: startDate } },
                _count: true,
                orderBy: { _count: { userId: 'desc' } },
                take: 10,
            }),
            prisma.activityLog.count({
                where: { createdAt: { gte: startDate } },
            }),
        ]);

        // Get user details for top users
        const userIds = byUser.map((u: { userId: string }) => u.userId);
        const users = await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, fullName: true },
        });
        const userMap = new Map(users.map((u: { id: string; fullName: string }) => [u.id, u.fullName]));

        res.json({
            period: `Last ${days} days`,
            totalActions: totalCount,
            byAction: byAction.map((a: { action: string; _count: number }) => ({ action: a.action, count: a._count })),
            byEntityType: byEntityType.map((e: { entityType: string; _count: number }) => ({ entityType: e.entityType, count: e._count })),
            topUsers: byUser.map((u: { userId: string; _count: number }) => ({
                userId: u.userId,
                userName: userMap.get(u.userId) || 'Unknown',
                count: u._count,
            })),
        });
    } catch (error) {
        console.error('Get activity stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
