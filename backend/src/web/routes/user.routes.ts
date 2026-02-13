import { Router } from 'express';
import { authenticateToken, isAdmin, canView } from '../../middleware/auth.middleware';
import { userController } from '../../interface/controllers/UserController';

const router = Router();

router.get('/simple', authenticateToken, canView, userController.listSimple);
router.get('/', authenticateToken, isAdmin, userController.list);
router.get('/:id', authenticateToken, isAdmin, userController.getById);
router.put('/:id', authenticateToken, isAdmin, userController.update);
router.delete('/:id', authenticateToken, isAdmin, userController.deactivate);
router.post('/:id/reset-password', authenticateToken, isAdmin, userController.resetPassword);

export default router;
