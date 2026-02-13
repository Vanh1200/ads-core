import { Router, Response } from 'express';
import prisma from '../config/database';
import { authenticateToken, AuthRequest, canView } from '../middleware/auth.middleware';

const router = Router();

// GET /api/dashboard/stats - Fast counts for dashboard top row
router.get('/stats', authenticateToken, canView, async (req: AuthRequest, res: Response) => {
    try {
        const [
            batchCount,
            miCount,
            customerCount,
            accountCount,
        ] = await Promise.all([
            prisma.accountBatch.count(),
            prisma.invoiceMCC.count(),
            prisma.customer.count(),
            prisma.account.count(),
        ]);

        res.json({
            batches: batchCount,
            invoiceMCCs: miCount,
            customers: customerCount,
            accounts: accountCount
        });

    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
