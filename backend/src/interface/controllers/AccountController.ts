import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../infrastructure/middleware/auth';
import { accountService } from '../../application/services/AccountService';
import { paginationSchema, createAccountSchema } from '../../interface/validators';
import { asyncHandler } from '../../infrastructure/middleware/errorHandler';
import { formatPaginationResponse } from '../../utils/pagination';

export class AccountController {
    list = asyncHandler(async (req: any, res: any) => {
        const query = paginationSchema.safeParse(req.query);
        const { page, limit, search, sortBy, sortOrder, ids } = query.success
            ? query.data
            : { page: 1, limit: 20, search: undefined, sortBy: undefined, sortOrder: 'desc' as const, ids: undefined };
        const { status, batchId } = req.query;

        const { data, total } = await accountService.list({
            page,
            limit,
            q: search,
            status: status as string,
            batchId: batchId as string,
            sortBy,
            sortOrder,
            ids,
        });

        res.json(formatPaginationResponse(data, total, page, limit));
    });

    getById = asyncHandler(async (req: AuthRequest, res: Response) => {
        const account = await accountService.getById(req.params.id as string);
        res.json(account);
    });

    getUnlinked = asyncHandler(async (req: AuthRequest, res: Response) => {
        const accounts = await accountService.getUnlinked();
        res.json(accounts);
    });

    getUnassigned = asyncHandler(async (req: AuthRequest, res: Response) => {
        const accounts = await accountService.getUnassigned();
        res.json(accounts);
    });

    create = asyncHandler(async (req: AuthRequest, res: Response) => {
        const validation = createAccountSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({ error: validation.error.errors });
            return;
        }

        const account = await accountService.create(
            validation.data,
            req.user!.id,
            req.ip,
        );

        res.status(201).json(account);
    });

    update = asyncHandler(async (req: AuthRequest, res: Response) => {
        const account = await accountService.update(
            req.params.id as string,
            req.body,
            req.user!.id,
            req.ip,
        );
        res.json(account);
    });

    bulkUpdateStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { accountIds, status } = req.body;
        if (!Array.isArray(accountIds) || accountIds.length === 0 || !status) {
            res.status(400).json({ error: 'Account IDs and status required' });
            return;
        }

        const result = await accountService.bulkUpdateStatus(accountIds, status, req.user!.id, req.ip);
        res.json(result);
    });

    bulkUnlinkMi = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { accountIds } = req.body;
        if (!Array.isArray(accountIds) || accountIds.length === 0) {
            res.status(400).json({ error: 'Account IDs required' });
            return;
        }

        const result = await accountService.bulkUnlinkMi(accountIds, req.user!.id, req.ip);
        res.json(result);
    });

    bulkUnassignMc = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { accountIds } = req.body;
        if (!Array.isArray(accountIds) || accountIds.length === 0) {
            res.status(400).json({ error: 'Account IDs required' });
            return;
        }

        const result = await accountService.bulkUnassignMc(accountIds, req.user!.id, req.ip);
        res.json(result);
    });
}

export const accountController = new AccountController();
