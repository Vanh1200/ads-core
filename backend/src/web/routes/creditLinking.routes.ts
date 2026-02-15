import { Router } from 'express';
import { authenticateToken, isLinker } from '../../infrastructure/middleware/auth';
import { creditLinkingController } from '../../interface/controllers/CreditLinkingController';

const router = Router();

router.post('/suggest', authenticateToken, isLinker, creditLinkingController.suggest);
router.post('/execute', authenticateToken, isLinker, creditLinkingController.execute);

export default router;
