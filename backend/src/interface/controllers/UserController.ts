import { Response } from 'express';
import { AuthRequest } from '../../infrastructure/middleware/auth';
import { userService } from '../../application/services/UserService';
import { asyncHandler } from '../../infrastructure/middleware/errorHandler';
import { paginationSchema } from '../../utils/validators';
import { formatPaginationResponse } from '../../utils/pagination';

export class UserController {
    listSimple = asyncHandler(async (req: AuthRequest, res: Response) => {
        const users = await userService.listSimple();
        res.json(users);
    });

    list = asyncHandler(async (req: AuthRequest, res: Response) => {
        const query = paginationSchema.safeParse(req.query);
        const { page, limit, search } = query.success ? query.data : { page: 1, limit: 20, search: undefined };
        const { data, total } = await userService.list({ page, limit, search });
        res.json(formatPaginationResponse(data, total, page, limit));
    });

    getById = asyncHandler(async (req: AuthRequest, res: Response) => {
        const user = await userService.getById(req.params.id as string);
        res.json(user);
    });

    update = asyncHandler(async (req: AuthRequest, res: Response) => {
        const user = await userService.update(req.params.id as string, req.body, req.user!.id, req.ip);
        res.json(user);
    });

    deactivate = asyncHandler(async (req: AuthRequest, res: Response) => {
        const result = await userService.deactivate(req.params.id as string, req.user!.id, req.ip);
        res.json(result);
    });

    resetPassword = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { newPassword } = req.body;
        const result = await userService.resetPassword(req.params.id as string, newPassword, req.user!.id, req.ip);
        res.json(result);
    });
}

export const userController = new UserController();
