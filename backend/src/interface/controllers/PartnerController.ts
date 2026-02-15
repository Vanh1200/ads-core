import { Response } from 'express';
import { AuthRequest } from '../../infrastructure/middleware/auth';
import { partnerService } from '../../application/services/PartnerService';
import { asyncHandler } from '../../infrastructure/middleware/errorHandler';
import { paginationSchema } from '../../utils/validators';
import { formatPaginationResponse } from '../../utils/pagination';

export class PartnerController {
    list = asyncHandler(async (req: any, res: any) => {
        const query = paginationSchema.safeParse(req.query);
        const { page, limit, search, sortBy, sortOrder } = query.success
            ? query.data
            : { page: 1, limit: 20, search: undefined, sortBy: undefined, sortOrder: 'desc' as const };

        const { data, total } = await partnerService.list({
            page,
            limit,
            q: search,
            sortBy,
            sortOrder,
        });
        res.json(formatPaginationResponse(data, total, page, limit));
    });

    getById = asyncHandler(async (req: any, res: any) => {
        const partner = await partnerService.getById(req.params.id as string);
        res.json(partner);
    });

    create = asyncHandler(async (req: any, res: any) => {
        const partner = await partnerService.create(req.body, req.user!.id, req.ip);
        res.status(201).json(partner);
    });

    update = asyncHandler(async (req: any, res: any) => {
        const partner = await partnerService.update(req.params.id as string, req.body, req.user!.id, req.ip);
        res.json(partner);
    });

    delete = asyncHandler(async (req: any, res: any) => {
        const result = await partnerService.delete(req.params.id as string, req.user!.id, req.ip);
        res.json(result);
    });
}

export const partnerController = new PartnerController();
