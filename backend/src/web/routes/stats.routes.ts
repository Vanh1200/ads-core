import { Router } from 'express';
import { authenticateToken, canView } from '../../infrastructure/middleware/auth';
import { statsController } from '../../interface/controllers/StatsController';

const router = Router();

router.get('/summary', authenticateToken, canView, statsController.getSummary);
router.get('/top-spenders', authenticateToken, canView, statsController.getTopSpenders);
router.get('/recent-activity', authenticateToken, canView, statsController.getRecentActivity);

export default router;
