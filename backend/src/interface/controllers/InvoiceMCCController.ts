import { Response } from 'express';
import { AuthRequest } from '../../infrastructure/middleware/auth';
import { invoiceMCCService } from '../../application/services/InvoiceMCCService';
import { spendingService } from '../../application/services/SpendingService';
import { paginationSchema } from '../../interface/validators';
import { asyncHandler } from '../../infrastructure/middleware/errorHandler';
import { formatPaginationResponse } from '../../utils/pagination';

export class InvoiceMCCController {
    list = asyncHandler(async (req: any, res: any) => {
        const query = paginationSchema.safeParse(req.query);
        const { page, limit, search, sortBy, sortOrder } = query.success
            ? query.data
            : { page: 1, limit: 20, search: undefined, sortBy: undefined, sortOrder: 'desc' as const };
        const { status, spendingDays } = req.query;

        let startDate: Date | undefined;
        let endDate: Date | undefined;

        if (spendingDays) {
            endDate = new Date();
            startDate = new Date();
            startDate.setDate(endDate.getDate() - Number(spendingDays));
        }

        const { data, total } = await invoiceMCCService.list({
            page,
            limit,
            search: search as string,
            status: status as string,
            sortBy,
            sortOrder,
            startDate,
            endDate,
        });

        res.json(formatPaginationResponse(data, total, page, limit));
    });

    getById = asyncHandler(async (req: any, res: any) => {
        const mcc = await invoiceMCCService.getById(req.params.id);
        res.json(mcc);
    });

    create = asyncHandler(async (req: any, res: any) => {
        const mcc = await invoiceMCCService.create(req.body, req.user!.id, req.ip);
        res.status(201).json(mcc);
    });

    update = asyncHandler(async (req: any, res: any) => {
        const mcc = await invoiceMCCService.update(req.params.id, req.body, req.user!.id, req.ip);
        res.json(mcc);
    });

    delete = asyncHandler(async (req: any, res: any) => {
        const result = await invoiceMCCService.delete(req.params.id, req.user!.id, req.ip);
        res.json(result);
    });

    linkAccounts = asyncHandler(async (req: any, res: any) => {
        const { accountIds } = req.body;
        const result = await invoiceMCCService.linkAccounts(req.params.id, accountIds, req.user!.id, req.ip);
        res.json(result);
    });
}

export const invoiceMCCController = new InvoiceMCCController();
