import { Router } from 'express';
import { authenticateToken, isAssigner, canView } from '../../infrastructure/middleware/auth';
import { customerController } from '../../interface/controllers/CustomerController';

const router = Router();

router.get('/', authenticateToken, canView, customerController.list);
router.get('/:id', authenticateToken, canView, customerController.getById);
router.post('/', authenticateToken, isAssigner, customerController.create);
router.put('/:id', authenticateToken, isAssigner, customerController.update);
router.delete('/:id', authenticateToken, isAssigner, customerController.delete);
// router.post('/:id/assign-accounts', authenticateToken, isAssigner, customerController.assignAccounts);

export default router;
