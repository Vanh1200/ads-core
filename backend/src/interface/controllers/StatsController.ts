import { Response } from 'express';
import { AuthRequest } from '../../infrastructure/middleware/auth';
import { statsService } from '../../application/services/StatsService';
import { asyncHandler } from '../../infrastructure/middleware/errorHandler';

export class StatsController {
    getSummary = asyncHandler(async (req: any, res: any) => {
        const summary = await statsService.getSummary();
        res.json(summary);
    });

    getTopSpenders = asyncHandler(async (req: AuthRequest, res: Response) => {
        const limit = parseInt(req.query.limit as string) || 5;
        const topSpenders = await statsService.getTopSpenders(limit);
        res.json(topSpenders);
    });

    getRecentActivity = asyncHandler(async (req: AuthRequest, res: Response) => {
        const limit = parseInt(req.query.limit as string) || 10;
        const activity = await statsService.getRecentActivity(limit);
        res.json(activity);
    });
}

export const statsController = new StatsController();
