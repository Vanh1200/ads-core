import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export interface AuthRequest extends Request {
    user?: {
        id: string;
        email: string;
        role: UserRole;
    };
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
};

export const requireRole = (roles: UserRole[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        if (req.user.role === UserRole.ADMIN) {
            return next();
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        next();
    };
};

export const isAdmin = requireRole([UserRole.ADMIN]);
export const isBuyer = requireRole([UserRole.ADMIN, UserRole.MANAGER, UserRole.BUYER]);
export const isLinker = requireRole([UserRole.ADMIN, UserRole.MANAGER, UserRole.LINKER]);
export const isAssigner = requireRole([UserRole.ADMIN, UserRole.MANAGER, UserRole.ASSIGNER]);
export const isUpdater = requireRole([UserRole.ADMIN, UserRole.MANAGER, UserRole.UPDATER]);
export const canView = requireRole([
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.BUYER,
    UserRole.LINKER,
    UserRole.ASSIGNER,
    UserRole.UPDATER,
    UserRole.VIEWER,
]);
