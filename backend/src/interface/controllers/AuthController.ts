import { Response } from 'express';
import { authService } from '../../application/services/AuthService';
import { asyncHandler } from '../../infrastructure/middleware/errorHandler';

export class AuthController {
    login = asyncHandler(async (req: any, res: any) => {
        const result = await authService.login(req.body);
        res.json(result);
    });

    register = asyncHandler(async (req: any, res: any) => {
        const result = await authService.register(req.body, req.user!.id, req.ip);
        res.status(201).json(result);
    });

    getMe = asyncHandler(async (req: any, res: any) => {
        const user = await authService.getMe(req.user!.id);
        res.json(user);
    });

    changePassword = asyncHandler(async (req: any, res: any) => {
        const { currentPassword, newPassword } = req.body;
        const result = await authService.changePassword(req.user!.id, currentPassword, newPassword);
        res.json(result);
    });
}

export const authController = new AuthController();
