import prisma from '../../infrastructure/database/prisma';

export class ActivityLogService {
    async list(params: { page: number; limit: number; userId?: string; entityType?: string; action?: string; startDate?: string; endDate?: string }) {
        const { page, limit, userId, entityType, action, startDate, endDate } = params;
        const where: any = {};
        if (userId) where.userId = userId;
        if (entityType) where.entityType = entityType;
        if (action) where.action = action;
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) where.createdAt.lte = new Date(endDate);
        }

        const [logs, total] = await Promise.all([
            prisma.activityLog.findMany({
                where,
                include: { user: { select: { id: true, fullName: true, email: true } } },
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            prisma.activityLog.count({ where }),
        ]);

        return { data: logs, total };
    }

    async getById(id: string) {
        if (!id.match(/^[0-9a-fA-F-]{36}$/)) throw new Error('NOT_FOUND: Activity log not found');

        const log = await prisma.activityLog.findUnique({
            where: { id },
            include: { user: { select: { id: true, fullName: true, email: true } } },
        });
        if (!log) throw new Error('NOT_FOUND: Activity log not found');
        return log;
    }

    async getEntityLogs(entityType: string, entityId: string) {
        return prisma.activityLog.findMany({
            where: { entityType, entityId },
            include: { user: { select: { id: true, fullName: true } } },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });
    }

    async getStats(days: number) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const [byAction, byEntityType, byUser, totalCount] = await Promise.all([
            prisma.activityLog.groupBy({ by: ['action'], where: { createdAt: { gte: startDate } }, _count: true }),
            prisma.activityLog.groupBy({ by: ['entityType'], where: { createdAt: { gte: startDate } }, _count: true }),
            prisma.activityLog.groupBy({ by: ['userId'], where: { createdAt: { gte: startDate } }, _count: true, orderBy: { _count: { userId: 'desc' } }, take: 10 }),
            prisma.activityLog.count({ where: { createdAt: { gte: startDate } } }),
        ]);

        const userIds = byUser.map((u: any) => u.userId);
        const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } });
        const userMap = new Map(users.map((u: any) => [u.id, u.fullName]));

        return {
            period: `Last ${days} days`,
            totalActions: totalCount,
            byAction: byAction.map((a: any) => ({ action: a.action, count: a._count })),
            byEntityType: byEntityType.map((e: any) => ({ entityType: e.entityType, count: e._count })),
            topUsers: byUser.map((u: any) => ({ userId: u.userId, userName: userMap.get(u.userId) || 'Unknown', count: u._count })),
        };
    }
}

export const activityLogService = new ActivityLogService();
