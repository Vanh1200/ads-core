import { Router } from 'express';
import { authenticateToken, isBuyer, canView } from '../../middleware/auth.middleware';
import { batchController } from '../../interface/controllers/BatchController';

const router = Router();

router.get('/', authenticateToken, canView, batchController.list);
router.get('/:id', authenticateToken, canView, batchController.getById);
router.get('/:id/accounts', authenticateToken, canView, batchController.getAccounts);
router.post('/', authenticateToken, isBuyer, batchController.create);
router.put('/:id', authenticateToken, isBuyer, batchController.update);
router.put('/bulk-update', authenticateToken, isBuyer, batchController.bulkUpdate);
router.delete('/:id', authenticateToken, isBuyer, batchController.delete);

export default router;
