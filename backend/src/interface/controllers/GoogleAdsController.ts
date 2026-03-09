import { Request, Response } from 'express';
import { googleAdsService } from '../../application/services/GoogleAdsService';
import { asyncHandler } from '../../infrastructure/middleware/errorHandler';

export class GoogleAdsController {
    // OAuth
    getAuthUrl = asyncHandler(async (req: Request, res: Response) => {
        const url = googleAdsService.getAuthUrl();
        res.json({ url });
    });

    oauthCallback = asyncHandler(async (req: Request, res: Response) => {
        const code = req.query.code as string | undefined;
        if (!code) {
            return res.status(400).json({ error: 'Missing authorization code' });
        }
        await googleAdsService.exchangeCodeForTokens(code);
        // Redirect back to frontend
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        res.redirect(`${frontendUrl}/google-ads?connected=true`);
    });

    getOAuthStatus = asyncHandler(async (req: Request, res: Response) => {
        const connected = googleAdsService.isConnected();
        const mccId = googleAdsService.getMccId();
        res.json({ connected, mccId });
    });

    disconnect = asyncHandler(async (req: Request, res: Response) => {
        googleAdsService.disconnect();
        res.json({ success: true });
    });

    // API
    getAccessibleCustomers = asyncHandler(async (req: Request, res: Response) => {
        const customers = await googleAdsService.listAccessibleCustomers();
        res.json({ customers });
    });

    getCustomerInfo = asyncHandler(async (req: Request, res: Response) => {
        const customerId = req.params.customerId as string;
        const loginCustomerId = req.headers['x-login-customer-id'] as string | undefined;
        const info = await googleAdsService.getCustomerInfo(customerId, loginCustomerId);
        if (!info) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        res.json(info);
    });

    getCustomerClients = asyncHandler(async (req: Request, res: Response) => {
        const managerId = req.params.managerId as string;
        const loginCustomerId = req.headers['x-login-customer-id'] as string | undefined;
        const clients = await googleAdsService.getCustomerClients(managerId, loginCustomerId);
        res.json({ clients });
    });

    getCampaigns = asyncHandler(async (req: Request, res: Response) => {
        const customerId = req.params.customerId as string;
        const loginCustomerId = req.headers['x-login-customer-id'] as string | undefined;
        const campaigns = await googleAdsService.getCampaigns(customerId, loginCustomerId);
        res.json({ campaigns });
    });

    getCampaignDetails = asyncHandler(async (req: Request, res: Response) => {
        const customerId = req.params.customerId as string;
        const campaignId = req.params.campaignId as string;
        const loginCustomerId = req.headers['x-login-customer-id'] as string | undefined;
        const details = await googleAdsService.getCampaignDetails(customerId, campaignId, loginCustomerId);
        if (!details) {
            return res.status(404).json({ error: 'Campaign not found' });
        }
        res.json(details);
    });

    getSpending = asyncHandler(async (req: Request, res: Response) => {
        const customerId = req.params.customerId as string;
        const dateRange = (req.query.dateRange as string) || 'LAST_7_DAYS';
        const loginCustomerId = req.headers['x-login-customer-id'] as string | undefined;
        const spending = await googleAdsService.getAccountSpending(customerId, dateRange, loginCustomerId);
        res.json({ spending });
    });
}

export const googleAdsController = new GoogleAdsController();
