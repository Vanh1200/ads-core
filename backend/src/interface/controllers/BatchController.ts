import { Response } from 'express';
import { AuthRequest } from '../../infrastructure/middleware/auth';
import { batchService } from '../../application/services/BatchService';
import { asyncHandler } from '../../infrastructure/middleware/errorHandler';
import { paginationSchema } from '../../utils/validators';

export class BatchController {
    list = asyncHandler(async (req: any, res: any) => {
        const query = paginationSchema.safeParse(req.query);
        const { page, limit } = query.success ? query.data : { page: 1, limit: 20 };
        const { status, year } = req.query;
        const result = await batchService.list({
            page,
            limit,
            status: status as string,
            year: year ? parseInt(year as string) : undefined,
        });
        res.json(result);
    });

    getById = asyncHandler(async (req: any, res: any) => {
        const result = await batchService.getById(req.params.id as string);
        res.json(result);
    });

    create = asyncHandler(async (req: any, res: any) => {
        const result = await batchService.create(req.body, req.user!.id, req.ip);
        res.status(201).json(result);
    });

    update = asyncHandler(async (req: any, res: any) => {
        const result = await batchService.update(req.params.id as string, req.body, req.user!.id, req.ip);
        res.json(result);
    });

    delete = asyncHandler(async (req: any, res: any) => {
        const result = await batchService.delete(req.params.id as string, req.user!.id, req.ip);
        res.json(result);
    });

    bulkUpdate = asyncHandler(async (req: any, res: any) => {
        const { ids, ...data } = req.body;
        const result = await batchService.bulkUpdate(ids, data, req.user!.id, req.ip);
        res.json(result);
    });

    getAccounts = asyncHandler(async (req: any, res: any) => {
        const result = await batchService.getAccountsByBatchId(req.params.id as string, req.query);
        res.json(result);
    });
}

export const batchController = new BatchController();
