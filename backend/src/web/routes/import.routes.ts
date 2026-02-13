import { Router } from 'express';
import { authenticateToken, isBuyer, isUpdater } from '../../middleware/auth.middleware';
import { importController, upload } from '../../interface/controllers/ImportController';

const router = Router();

router.post('/accounts', authenticateToken, isBuyer, upload.single('file'), importController.importAccounts);
router.post('/parse-batch', authenticateToken, isBuyer, upload.single('file'), importController.parseBatch);
router.post('/create-batch-with-accounts', authenticateToken, isBuyer, importController.createBatchWithAccounts);
// router.post('/spending', authenticateToken, isUpdater, upload.single('file'), importController.importSpending);
router.post('/spending/preview', authenticateToken, isUpdater, upload.single('file'), importController.previewSpending);
router.post('/spending/confirm', authenticateToken, isUpdater, importController.confirmSpending);

export default router;
