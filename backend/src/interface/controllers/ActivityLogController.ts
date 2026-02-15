import { Response } from 'express';
import { AuthRequest } from '../../infrastructure/middleware/auth';
import { activityLogService } from '../../application/services/ActivityLogService';
import { paginationSchema } from '../../interface/validators';
import { asyncHandler } from '../../infrastructure/middleware/errorHandler';
import { formatPaginationResponse } from '../../utils/pagination';

export class ActivityLogController {
    list = asyncHandler(async (req: any, res: any) => {
        const query = paginationSchema.safeParse(req.query);
        const { page, limit } = query.success ? query.data : { page: 1, limit: 50 };
        const { userId, entityType } = req.query;

        const { data, total } = await activityLogService.list({
            page,
            limit,
            userId: userId as string,
            entityType: entityType as string,
        });

        res.json(formatPaginationResponse(data, total, page, limit));
    });

    getEntityLogs = asyncHandler(async (req: any, res: any) => {
        const { type, id } = req.params;
        const logs = await activityLogService.getEntityLogs(type, id);
        res.json(logs);
    });

    getStats = asyncHandler(async (req: any, res: any) => {
        const days = req.query.days ? parseInt(req.query.days as string) : 7;
        const stats = await activityLogService.getStats(days);
        res.json(stats);
    });

    getById = asyncHandler(async (req: any, res: any) => {
        const log = await activityLogService.getById(req.params.id);
        res.json(log);
    });
}

export const activityLogController = new ActivityLogController();
