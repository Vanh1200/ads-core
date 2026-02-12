import { Request, Response, NextFunction } from 'express';
export interface AuthRequest extends Request {
    user?: {
        id: string;
        email: string;
        role: string;
    };
}
export declare const authenticateToken: (req: AuthRequest, res: Response, next: NextFunction) => void;
export declare const requireRole: (...roles: string[]) => (req: AuthRequest, res: Response, next: NextFunction) => void;
export declare const isAdmin: (req: AuthRequest, res: Response, next: NextFunction) => void;
export declare const isBuyer: (req: AuthRequest, res: Response, next: NextFunction) => void;
export declare const isLinker: (req: AuthRequest, res: Response, next: NextFunction) => void;
export declare const isAssigner: (req: AuthRequest, res: Response, next: NextFunction) => void;
export declare const isUpdater: (req: AuthRequest, res: Response, next: NextFunction) => void;
export declare const canView: (req: AuthRequest, res: Response, next: NextFunction) => void;
