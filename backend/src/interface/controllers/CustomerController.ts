import { Response } from 'express';
import { AuthRequest } from '../../infrastructure/middleware/auth';
import { customerService } from '../../application/services/CustomerService';
import { paginationSchema } from '../../interface/validators';
import { asyncHandler } from '../../infrastructure/middleware/errorHandler';
import { formatPaginationResponse } from '../../utils/pagination';

export class CustomerController {
    list = asyncHandler(async (req: any, res: any) => {
        const query = paginationSchema.safeParse(req.query);
        const { page, limit, search } = query.success ? query.data : { page: 1, limit: 20, search: undefined };
        const { status } = req.query;

        const { data, total } = await customerService.list({
            page,
            limit,
            q: search,
            status: status as string,
        });

        res.json(formatPaginationResponse(data, total, page, limit));
    });

    getById = asyncHandler(async (req: any, res: any) => {
        const customer = await customerService.getById(req.params.id);
        res.json(customer);
    });

    create = asyncHandler(async (req: any, res: any) => {
        const customer = await customerService.create(req.body, req.user!.id, req.ip);
        res.status(201).json(customer);
    });

    update = asyncHandler(async (req: any, res: any) => {
        const customer = await customerService.update(req.params.id, req.body, req.user!.id, req.ip);
        res.json(customer);
    });

    delete = asyncHandler(async (req: any, res: any) => {
        const result = await customerService.delete(req.params.id, req.user!.id, req.ip);
        res.json(result);
    });
}

export const customerController = new CustomerController();
