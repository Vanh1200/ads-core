import { Router, Response } from 'express';
import prisma from '../config/database';
import { authenticateToken, AuthRequest, canView } from '../middleware/auth.middleware';

const router = Router();

// GET /api/stats/summary - Total counts for dashboard cards
router.get('/summary', authenticateToken, canView, async (req: AuthRequest, res: Response) => {
    try {
        const [batches, invoiceMCCs, customers, accounts] = await Promise.all([
            prisma.accountBatch.count(),
            prisma.invoiceMCC.count(),
            prisma.customer.count(),
            prisma.account.count(),
        ]);

        res.json({
            batches,
            invoiceMCCs,
            customers,
            accounts,
        });
    } catch (error) {
        console.error('Get stats summary error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/stats/top-spenders - Optimized top accounts query
router.get('/top-spenders', authenticateToken, canView, async (req: AuthRequest, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 5;
        const accounts = await prisma.account.findMany({
            take: limit,
            orderBy: { totalSpending: 'desc' },
            select: {
                id: true,
                googleAccountId: true,
                accountName: true,
                totalSpending: true,
                currency: true,
            }
        });

        res.json(accounts);
    } catch (error) {
        console.error('Get top spenders error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/stats/recent-activity - Optimized recent logs
router.get('/recent-activity', authenticateToken, canView, async (req: AuthRequest, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 10;
        const logs = await prisma.activityLog.findMany({
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: {
                user: { select: { fullName: true, email: true } },
            },
        });

        res.json(logs);
    } catch (error) {
        console.error('Get recent activity error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
