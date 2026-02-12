import prisma from '../config/database';

import { ActivityAction } from '@prisma/client';

interface LogActivityParams {
    userId: string;
    action: ActivityAction;
    entityType: string;
    entityId: string;
    oldValues?: object;
    newValues?: object;
    description?: string;
    ipAddress?: string;
}

export const logActivity = async (params: LogActivityParams) => {
    try {
        await prisma.activityLog.create({
            data: {
                userId: params.userId,
                action: params.action,
                entityType: params.entityType,
                entityId: params.entityId,
                oldValues: params.oldValues ? JSON.parse(JSON.stringify(params.oldValues)) : undefined,
                newValues: params.newValues ? JSON.parse(JSON.stringify(params.newValues)) : undefined,
                description: params.description,
                ipAddress: params.ipAddress,
            },
        });
    } catch (error) {
        console.error('Failed to log activity:', error);
    }
};

export default logActivity;
