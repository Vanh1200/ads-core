import { Router } from 'express';
import { accountController } from '../../interface/controllers/AccountController';
import { authenticateToken, canView, isBuyer, isLinker, isAssigner } from '../../infrastructure/middleware/auth';

const router = Router();

// Query routes (must be before /:id to avoid conflicts)
router.get('/unlinked', authenticateToken, canView, accountController.getUnlinked);
router.get('/unassigned', authenticateToken, canView, accountController.getUnassigned);

// CRUD
router.get('/', authenticateToken, canView, accountController.list);
router.get('/:id', authenticateToken, canView, accountController.getById);
router.post('/', authenticateToken, isBuyer, accountController.create);
router.put('/:id', authenticateToken, isBuyer, accountController.update);

// Bulk operations
router.post('/bulk-update-status', authenticateToken, isBuyer, accountController.bulkUpdateStatus);
router.post('/bulk-unlink-mi', authenticateToken, isLinker, accountController.bulkUnlinkMi);
router.post('/bulk-unassign-mc', authenticateToken, isAssigner, accountController.bulkUnassignMc);

export default router;
