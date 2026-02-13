import { Request, Response, NextFunction } from 'express';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    requestId?: string;
    method?: string;
    url?: string;
    userId?: string;
    duration?: number;
    statusCode?: number;
    [key: string]: any;
}

/**
 * Structured Logger for production debugging.
 * Outputs JSON in production, pretty-printed in development.
 */
class Logger {
    private isDev = process.env.NODE_ENV === 'development';

    private log(level: LogLevel, message: string, meta?: Record<string, any>) {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            ...meta,
        };

        if (this.isDev) {
            const color = level === 'error' ? '\x1b[31m' : level === 'warn' ? '\x1b[33m' : level === 'info' ? '\x1b[36m' : '\x1b[90m';
            console.log(`${color}[${level.toUpperCase()}]\x1b[0m ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
        } else {
            // JSON format for production log aggregators
            const output = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
            output(JSON.stringify(entry));
        }
    }

    error(message: string, meta?: Record<string, any>) { this.log('error', message, meta); }
    warn(message: string, meta?: Record<string, any>) { this.log('warn', message, meta); }
    info(message: string, meta?: Record<string, any>) { this.log('info', message, meta); }
    debug(message: string, meta?: Record<string, any>) { this.log('debug', message, meta); }
}

export const logger = new Logger();

/**
 * Express middleware for request logging.
 * Logs method, URL, status code, duration, and user ID for every request.
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;

    // Attach requestId for downstream use
    (req as any).requestId = requestId;

    res.on('finish', () => {
        const duration = Date.now() - start;
        const userId = (req as any).user?.id;

        // Skip health checks and static assets
        if (req.url === '/health' || req.url.startsWith('/static')) return;

        const level: LogLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

        logger[level](`${req.method} ${req.url} ${res.statusCode}`, {
            requestId,
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            userId: userId || 'anonymous',
            ip: req.ip,
        });
    });

    next();
};

export default logger;
