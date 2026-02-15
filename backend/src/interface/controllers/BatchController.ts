import { Response } from 'express';
import { AuthRequest } from '../../infrastructure/middleware/auth';
import { batchService } from '../../application/services/BatchService';
import { spendingService } from '../../application/services/SpendingService';
import { asyncHandler } from '../../infrastructure/middleware/errorHandler';
import { paginationSchema } from '../../utils/validators';
import { formatPaginationResponse } from '../../utils/pagination';

export class BatchController {
    list = asyncHandler(async (req: any, res: any) => {
        const query = paginationSchema.safeParse(req.query);
        const { page, limit, sortBy, sortOrder, ids } = query.success
            ? query.data
            : { page: 1, limit: 20, sortBy: undefined, sortOrder: 'desc' as const, ids: undefined };
        const { status, year } = req.query;
        const { data, total } = await batchService.list({
            page,
            limit,
            status: status as string,
            year: year ? parseInt(year as string) : undefined,
            sortBy,
            sortOrder,
            ids,
        });

        // Enrich with spending data
        const spendingDays = req.query.spendingDays ? parseInt(req.query.spendingDays as string) : 7;
        const spendingMap = await spendingService.getRangeSpendingMap('batch', data.map(b => b.id), spendingDays);

        const enrichedData = data.map(batch => ({
            ...batch,
            rangeSpending: spendingMap[batch.id] || 0
        }));

        res.json(formatPaginationResponse(enrichedData, total, page, limit));
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
        const query = paginationSchema.safeParse(req.query);
        const { page, limit } = query.success ? query.data : { page: 1, limit: 20 };
        const { data, total } = await batchService.getAccountsByBatchId(req.params.id as string, { page, limit });
        res.json(formatPaginationResponse(data, total, page, limit));
    });
}

export const batchController = new BatchController();
