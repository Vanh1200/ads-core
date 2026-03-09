import { Router } from 'express';
import { authenticateToken, canView } from '../../infrastructure/middleware/auth';
import { googleAdsController } from '../../interface/controllers/GoogleAdsController';

const router = Router();

// OAuth routes
router.get('/oauth/url', authenticateToken, canView, googleAdsController.getAuthUrl);
router.get('/oauth/callback', googleAdsController.oauthCallback); // No auth - Google redirects here
router.get('/oauth/status', authenticateToken, canView, googleAdsController.getOAuthStatus);
router.post('/oauth/disconnect', authenticateToken, canView, googleAdsController.disconnect);

// Google Ads API data routes
router.get('/accessible-customers', authenticateToken, canView, googleAdsController.getAccessibleCustomers);
router.get('/customer-info/:customerId', authenticateToken, canView, googleAdsController.getCustomerInfo);
router.get('/customer-clients/:managerId', authenticateToken, canView, googleAdsController.getCustomerClients);
router.get('/campaigns/:customerId', authenticateToken, canView, googleAdsController.getCampaigns);
router.get('/campaign-details/:customerId/:campaignId', authenticateToken, canView, googleAdsController.getCampaignDetails);
router.get('/spending/:customerId', authenticateToken, canView, googleAdsController.getSpending);

export default router;
