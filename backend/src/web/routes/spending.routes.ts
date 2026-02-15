import { Router } from 'express';
import { authenticateToken, isUpdater, canView } from '../../infrastructure/middleware/auth';
import { spendingController } from '../../interface/controllers/SpendingController';

const router = Router();

router.get('/snapshots', authenticateToken, canView, spendingController.listSnapshots);
router.post('/snapshot', authenticateToken, isUpdater, spendingController.createSnapshot);
router.post('/calculate', authenticateToken, isUpdater, spendingController.calculateRecords);
router.get('/records', authenticateToken, canView, spendingController.getRecords);
router.get('/summary/customer/:id', authenticateToken, canView, spendingController.getCustomerSummary);
router.get('/summary/invoice-mcc/:id', authenticateToken, canView, spendingController.getInvoiceMCCSummary);
router.get('/summary/batch/:id', authenticateToken, canView, spendingController.getBatchSummary);
router.get('/account/:id/chart', authenticateToken, canView, spendingController.getAccountChart);
router.get('/chart', authenticateToken, canView, spendingController.getGlobalChart);

export default router;
