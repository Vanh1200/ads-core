import { Router } from 'express';
import { authenticateToken, isAdmin } from '../../middleware/auth.middleware';
import { authController } from '../../interface/controllers/AuthController';

const router = Router();

router.post('/login', authController.login);
router.post('/register', authenticateToken, isAdmin, authController.register);
router.get('/me', authenticateToken, authController.getMe);
router.post('/change-password', authenticateToken, authController.changePassword);

export default router;
