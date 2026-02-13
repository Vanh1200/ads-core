import { Router } from 'express';
import { authenticateToken, isLinker, canView } from '../../middleware/auth.middleware';
import { invoiceMCCController } from '../../interface/controllers/InvoiceMCCController';

const router = Router();

router.get('/', authenticateToken, canView, invoiceMCCController.list);
router.get('/:id', authenticateToken, canView, invoiceMCCController.getById);
router.post('/', authenticateToken, isLinker, invoiceMCCController.create);
router.put('/:id', authenticateToken, isLinker, invoiceMCCController.update);
router.delete('/:id', authenticateToken, isLinker, invoiceMCCController.delete);
// router.post('/:id/link-accounts', authenticateToken, isLinker, invoiceMCCController.linkAccounts);

export default router;
