import prisma from '../database/prisma';
import { ActivityAction } from '@prisma/client';

export interface LogActivityParams {
    userId: string;
    action: ActivityAction;
    entityType: string;
    entityId: string;
    oldValues?: any;
    newValues?: any;
    description?: string;
    ipAddress?: string;
}

export const logActivity = async (params: LogActivityParams) => {
    return prisma.activityLog.create({
        data: {
            userId: params.userId,
            action: params.action,
            entityType: params.entityType,
            entityId: params.entityId,
            oldValues: params.oldValues || null,
            newValues: params.newValues || null,
            description: params.description || null,
            ipAddress: params.ipAddress || null,
        },
    });
};
