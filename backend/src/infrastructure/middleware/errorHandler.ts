import { Request, Response, NextFunction } from 'express';

/**
 * Enhanced global error handler middleware.
 * Catches all errors thrown in route handlers and returns standardized responses.
 * 
 * Supports:
 * - JWT token expiry → 401 with SESSION_EXPIRED code (enables frontend auto-logout)
 * - Prisma errors (unique constraint, not found)
 * - Zod validation errors
 * - Custom application errors (NOT_FOUND:, CONFLICT:, FORBIDDEN)
 * - Generic 500 fallback
 */
export const errorHandler = (
    err: Error & { code?: string },
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    const timestamp = new Date().toISOString();
    const requestId = req.headers['x-request-id'] || 'N/A';

    // Structured error log
    console.error(JSON.stringify({
        timestamp,
        level: 'error',
        requestId,
        method: req.method,
        url: req.url,
        userId: (req as any).user?.id || 'anonymous',
        error: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    }));

    // 1. JWT Token Expired
    if (err.name === 'TokenExpiredError') {
        res.status(401).json({
            error: 'Token expired',
            code: 'SESSION_EXPIRED',
            message: 'Your session has expired. Please log in again.',
        });
        return;
    }

    // 2. JWT Invalid Token
    if (err.name === 'JsonWebTokenError') {
        res.status(401).json({
            error: 'Invalid token',
            code: 'INVALID_TOKEN',
        });
        return;
    }

    // 3. Zod Validation Error
    if (err.name === 'ZodError') {
        res.status(400).json({
            error: 'Validation Error',
            code: 'VALIDATION_ERROR',
            details: (err as any).errors || err.message,
        });
        return;
    }

    // 4. Prisma Errors
    if (err.constructor?.name === 'PrismaClientKnownRequestError') {
        const prismaErr = err as any;
        switch (prismaErr.code) {
            case 'P2002': // Unique constraint violation
                res.status(409).json({
                    error: 'Resource already exists',
                    code: 'DUPLICATE',
                    field: prismaErr.meta?.target?.[0],
                });
                return;
            case 'P2025': // Record not found
                res.status(404).json({
                    error: 'Resource not found',
                    code: 'NOT_FOUND',
                });
                return;
            case 'P2003': // Foreign key constraint
                res.status(400).json({
                    error: 'Cannot delete: resource is referenced by other records',
                    code: 'FK_CONSTRAINT',
                });
                return;
        }
    }

    // 5. Custom Application Errors
    if (err.message === 'UNAUTHORIZED') {
        res.status(401).json({ error: 'Authentication required', code: 'UNAUTHORIZED' });
        return;
    }

    if (err.message === 'FORBIDDEN') {
        res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' });
        return;
    }

    if (['LICENSE_INVALID', 'LICENSE_UNAVAILABLE', 'SESSION_INVALID', 'FINGERPRINT_CHANGED', 'DEVICE_REVOKED'].includes(err.message)) {
        res.status(401).json({ error: 'License or session is invalid', code: err.message });
        return;
    }

    if (err.message === 'DEVICE_LIMIT_REACHED') {
        res.status(409).json({ error: 'Device limit reached', code: 'DEVICE_LIMIT_REACHED' });
        return;
    }

    if (err.message === 'CHALLENGE_EXPIRED') {
        res.status(408).json({ error: 'Activation challenge expired', code: 'CHALLENGE_EXPIRED' });
        return;
    }

    if (err.message === 'CHALLENGE_REPLAYED') {
        res.status(409).json({ error: 'Activation challenge was already used', code: 'CHALLENGE_REPLAYED' });
        return;
    }

    if (err.message === 'INVALID_DEVICE_PROOF') {
        res.status(400).json({ error: 'Invalid device proof', code: 'INVALID_DEVICE_PROOF' });
        return;
    }

    if (err.message === 'DEVICE_CONTEXT_CHANGED') {
        res.status(409).json({ error: 'Device context changed', code: 'DEVICE_CONTEXT_CHANGED' });
        return;
    }

    if (err.message?.startsWith('EXTENSION_UPDATE_REQUIRED:')) {
        const minimumVersion = err.message.split(':', 2)[1] || null;
        res.status(426).json({ error: 'Extension update required', code: 'EXTENSION_UPDATE_REQUIRED', minimumVersion });
        return;
    }

    if (err.message?.startsWith('NOT_FOUND:')) {
        res.status(404).json({
            error: err.message.replace('NOT_FOUND:', '').trim(),
            code: 'NOT_FOUND',
        });
        return;
    }

    if (err.message?.startsWith('CONFLICT:')) {
        res.status(409).json({
            error: err.message.replace('CONFLICT:', '').trim(),
            code: 'CONFLICT',
        });
        return;
    }

    if (err.message?.startsWith('BAD_REQUEST:')) {
        res.status(400).json({
            error: err.message.replace('BAD_REQUEST:', '').trim(),
            code: 'BAD_REQUEST',
        });
        return;
    }

    // 7. Google Ads API Errors
    if (err.message?.startsWith('Google Ads API error')) {
        const match = err.message.match(/\((\d+)\):\s*(.*)/);
        const statusCode = match ? parseInt(match[1]) : 500;
        const message = match ? match[2].replace(/^"|"$/g, '') : err.message;
        res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 502).json({
            error: message,
            code: 'GOOGLE_ADS_ERROR',
        });
        return;
    }

    // 8. Default: Internal Server Error
    res.status(500).json({
        error: 'Internal Server Error',
        code: 'INTERNAL_ERROR',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
};

/**
 * Async route wrapper to automatically catch errors and pass them to errorHandler.
 * Eliminates the need for try-catch in every route handler.
 */
export const asyncHandler = (fn: (req: any, res: Response, next: NextFunction) => Promise<any>) => {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
