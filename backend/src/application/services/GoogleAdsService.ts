import axios, { AxiosInstance } from 'axios';
import fs from 'fs';
import path from 'path';

const GOOGLE_ADS_API_VERSION = 'v23';
const GOOGLE_ADS_BASE_URL = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKENS_FILE = path.join(__dirname, '../../../google-ads-tokens.json');

interface GoogleTokens {
    access_token: string;
    refresh_token: string;
    expires_at: number;
}

class GoogleAdsService {
    private developerToken: string;
    private mccId: string;
    private clientId: string;
    private clientSecret: string;
    private redirectUri: string;

    constructor() {
        this.developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '';
        this.mccId = process.env.GOOGLE_ADS_MCC_ID || '';
        this.clientId = process.env.GOOGLE_CLIENT_ID || '';
        this.clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';

        const defaultRedirect = 'http://localhost:3001/api/google-ads/oauth/callback';
        this.redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || defaultRedirect;

        if (process.env.NODE_ENV === 'production' && this.redirectUri === defaultRedirect) {
            console.warn('[GoogleAdsService] WARNING: GOOGLE_OAUTH_REDIRECT_URI is not set in production. Defaulting to localhost!');
        }
    }

    // ===== OAuth 2.0 Flow =====

    getAuthUrl(): string {
        console.log(`[GoogleAdsService] Generating Auth URL with clientId: ${this.clientId} and redirectUri: ${this.redirectUri}`);
        const params = new URLSearchParams({
            client_id: this.clientId,
            redirect_uri: this.redirectUri,
            response_type: 'code',
            scope: 'https://www.googleapis.com/auth/adwords',
            access_type: 'offline',
            prompt: 'consent',
        });
        return `${GOOGLE_OAUTH_AUTH_URL}?${params.toString()}`;
    }

    async exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
        const response = await axios.post(GOOGLE_OAUTH_TOKEN_URL, {
            code,
            client_id: this.clientId,
            client_secret: this.clientSecret,
            redirect_uri: this.redirectUri,
            grant_type: 'authorization_code',
        });

        const tokens: GoogleTokens = {
            access_token: response.data.access_token,
            refresh_token: response.data.refresh_token,
            expires_at: Date.now() + (response.data.expires_in * 1000) - 60000, // 1 min buffer
        };

        this.saveTokens(tokens);
        return tokens;
    }

    async refreshAccessToken(): Promise<string> {
        const tokens = this.loadTokens();
        if (!tokens) throw new Error('No tokens saved. Please authorize first.');

        const response = await axios.post(GOOGLE_OAUTH_TOKEN_URL, {
            client_id: this.clientId,
            client_secret: this.clientSecret,
            refresh_token: tokens.refresh_token,
            grant_type: 'refresh_token',
        }, { timeout: 10000 });

        tokens.access_token = response.data.access_token;
        tokens.expires_at = Date.now() + (response.data.expires_in * 1000) - 60000;
        this.saveTokens(tokens);

        return tokens.access_token;
    }

    private async getAccessToken(): Promise<string> {
        const tokens = this.loadTokens();
        if (!tokens) throw new Error('Not connected to Google Ads. Please authorize first.');

        if (Date.now() >= tokens.expires_at) {
            return this.refreshAccessToken();
        }

        return tokens.access_token;
    }

    private saveTokens(tokens: GoogleTokens): void {
        fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
    }

    private loadTokens(): GoogleTokens | null {
        try {
            if (fs.existsSync(TOKENS_FILE)) {
                const data = fs.readFileSync(TOKENS_FILE, 'utf-8');
                return JSON.parse(data);
            }
        } catch (err) {
            console.error('[GoogleAdsService] Error loading tokens:', err);
        }
        return null;
    }

    isConnected(): boolean {
        const tokens = this.loadTokens();
        return tokens !== null && !!tokens.refresh_token;
    }

    disconnect(): void {
        try {
            if (fs.existsSync(TOKENS_FILE)) {
                fs.unlinkSync(TOKENS_FILE);
            }
        } catch (err) {
            console.error('[GoogleAdsService] Error disconnecting:', err);
        }
    }

    // ===== API Helpers =====

    private async getHeaders(loginCustomerId?: string, skipLoginId: boolean = false): Promise<Record<string, string>> {
        const accessToken = await this.getAccessToken();
        const headers: Record<string, string> = {
            'Authorization': `Bearer ${accessToken}`,
            'developer-token': this.developerToken,
            'Content-Type': 'application/json',
        };
        if (!skipLoginId) {
            if (loginCustomerId) {
                headers['login-customer-id'] = loginCustomerId.replace(/-/g, '');
            } else if (this.mccId) {
                headers['login-customer-id'] = this.mccId.replace(/-/g, '');
            }
        }
        return headers;
    }

    private async gaqlSearch(customerId: string, query: string, loginCustomerId?: string): Promise<any[]> {
        const cid = customerId.replace(/-/g, '');
        const headers = await this.getHeaders(loginCustomerId);
        const url = `${GOOGLE_ADS_BASE_URL}/customers/${cid}/googleAds:search`;

        const allResults: any[] = [];
        let pageToken: string | undefined = undefined;

        do {
            const body: any = { query };
            if (pageToken) body.pageToken = pageToken;

            try {
                const response = await axios.post(url, body, { headers });
                const results = response.data.results || [];
                allResults.push(...results);
                pageToken = response.data.nextPageToken;
            } catch (err: any) {
                const errData = err.response?.data;
                console.error('[GoogleAdsService] GAQL error details:', JSON.stringify(errData?.error?.details || errData, null, 2));
                throw new Error(`Google Ads API error (${err.response?.status}): ${JSON.stringify(errData?.error?.message || errData)}`);
            }
        } while (pageToken);

        return allResults;
    }

    // ===== Google Ads API Methods =====

    async listAccessibleCustomers(): Promise<string[]> {
        const headers = await this.getHeaders(undefined, true);
        const url = `${GOOGLE_ADS_BASE_URL}/customers:listAccessibleCustomers`;
        try {
            const response = await axios.get(url, { headers });
            return (response.data.resourceNames || []).map((rn: string) => rn.replace('customers/', ''));
        } catch (err: any) {
            const errData = err.response?.data;
            console.error('[GoogleAdsService] listAccessibleCustomers error:', JSON.stringify(errData, null, 2));
            throw new Error(`Google Ads API error (${err.response?.status}): ${JSON.stringify(errData?.error?.message || errData)}`);
        }
    }

    async getCustomerInfo(customerId: string): Promise<any> {
        const query = `
            SELECT
                customer.id,
                customer.descriptive_name,
                customer.currency_code,
                customer.time_zone,
                customer.manager,
                customer.status,
                customer.auto_tagging_enabled,
                customer.has_partners_badge
            FROM customer
            LIMIT 1
        `;
        const results = await this.gaqlSearch(customerId, query);
        return results.length > 0 ? results[0].customer : null;
    }

    async getCustomerClients(managerId: string): Promise<any[]> {
        const query = `
            SELECT
                customer_client.client_customer,
                customer_client.id,
                customer_client.descriptive_name,
                customer_client.currency_code,
                customer_client.time_zone,
                customer_client.manager,
                customer_client.status,
                customer_client.level
            FROM customer_client
            WHERE customer_client.level <= 1
        `;
        const results = await this.gaqlSearch(managerId, query);
        return results.map((r: any) => r.customerClient);
    }

    async getCampaigns(customerId: string): Promise<any[]> {
        const query = `
            SELECT
                campaign.id,
                campaign.name,
                campaign.status,
                campaign.advertising_channel_type,
                campaign.bidding_strategy_type
            FROM campaign
            ORDER BY campaign.name
        `;
        return this.gaqlSearch(customerId, query);
    }

    async getCampaignDetails(customerId: string, campaignId: string): Promise<any> {
        const query = `
            SELECT
                campaign.id,
                campaign.name,
                campaign.status,
                campaign.advertising_channel_type,
                campaign.advertising_channel_sub_type,
                campaign.bidding_strategy_type,
                campaign.serving_status,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions,
                metrics.ctr,
                metrics.average_cpc
            FROM campaign
            WHERE campaign.id = ${campaignId}
        `;
        const results = await this.gaqlSearch(customerId, query);
        return results.length > 0 ? results[0] : null;
    }

    async getAccountSpending(customerId: string, dateRange: string = 'LAST_7_DAYS'): Promise<any[]> {
        const query = `
            SELECT
                segments.date,
                metrics.cost_micros,
                metrics.impressions,
                metrics.clicks,
                metrics.conversions,
                metrics.ctr,
                metrics.average_cpc
            FROM customer
            WHERE segments.date DURING ${dateRange}
            ORDER BY segments.date DESC
        `;
        return this.gaqlSearch(customerId, query);
    }

    getMccId(): string {
        return this.mccId;
    }
}

export const googleAdsService = new GoogleAdsService();
