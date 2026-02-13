import { Router } from 'express';
import { authenticateToken, isAdmin, canView } from '../../middleware/auth.middleware';
import { activityLogController } from '../../interface/controllers/ActivityLogController';

const router = Router();

router.get('/', authenticateToken, canView, activityLogController.list);
// router.get('/stats', authenticateToken, isAdmin, activityLogController.getStats);
// router.get('/entity/:type/:id', authenticateToken, canView, activityLogController.getEntityLogs);
// router.get('/:id', authenticateToken, canView, activityLogController.getById);

export default router;
