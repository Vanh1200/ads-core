import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
    user?: {
        id: string;
        email: string;
        role: string;
    };
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction): void => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        res.status(401).json({ error: 'Access token required' });
        return;
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as {
            id: string;
            email: string;
            role: string;
        };
        req.user = decoded;
        next();
    } catch (error) {
        res.status(403).json({ error: 'Invalid or expired token' });
    }
};

// Role-based access control middleware
export const requireRole = (...roles: string[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }

        if (!roles.includes(req.user.role)) {
            res.status(403).json({ error: 'Insufficient permissions' });
            return;
        }

        next();
    };
};

// Specific role checks
export const isAdmin = requireRole('ADMIN');
export const isBuyer = requireRole('ADMIN', 'MANAGER', 'BUYER');
export const isLinker = requireRole('ADMIN', 'MANAGER', 'LINKER');
export const isAssigner = requireRole('ADMIN', 'MANAGER', 'ASSIGNER');
export const isUpdater = requireRole('ADMIN', 'MANAGER', 'UPDATER');
export const canView = requireRole('ADMIN', 'MANAGER', 'BUYER', 'LINKER', 'ASSIGNER', 'UPDATER', 'VIEWER');
