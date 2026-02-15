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
}

export const activityLogController = new ActivityLogController();
