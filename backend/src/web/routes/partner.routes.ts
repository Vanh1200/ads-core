import { Router } from 'express';
import { authenticateToken, canView } from '../../infrastructure/middleware/auth';
import { partnerController } from '../../interface/controllers/PartnerController';

const router = Router();

router.get('/', authenticateToken, canView, partnerController.list);
router.get('/:id', authenticateToken, canView, partnerController.getById);
router.post('/', authenticateToken, partnerController.create);
router.put('/:id', authenticateToken, partnerController.update);
router.delete('/:id', authenticateToken, partnerController.delete);

export default router;
