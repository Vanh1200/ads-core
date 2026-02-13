import prisma from '../prisma';

export interface ActivityLog {
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    oldValues: any;
    newValues: any;
    description: string | null;
    ipAddress: string | null;
    userId: string;
    createdAt: Date;
}

export interface IActivityLogRepository {
    list(params: { page: number; limit: number; userId?: string; entityType?: string }): Promise<{ data: ActivityLog[]; total: number }>;
}

export class PrismaActivityLogRepository implements IActivityLogRepository {
    async list(params: { page: number; limit: number; userId?: string; entityType?: string }): Promise<{ data: ActivityLog[]; total: number }> {
        const { page, limit, userId, entityType } = params;
        const where: any = {};
        if (userId) where.userId = userId;
        if (entityType) where.entityType = entityType;

        const [logs, total] = await Promise.all([
            prisma.activityLog.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: { user: { select: { id: true, fullName: true } } },
            }),
            prisma.activityLog.count({ where }),
        ]);

        return { data: logs as any, total };
    }
}

export const activityLogRepository = new PrismaActivityLogRepository();
