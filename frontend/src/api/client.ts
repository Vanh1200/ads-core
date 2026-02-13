import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // Only redirect if not already on login page or if request is not login
            if (!window.location.pathname.includes('/login') && !error.config.url?.includes('/auth/login')) {
                localStorage.removeItem('token');
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

// Auth API
export const authApi = {
    login: (email: string, password: string) =>
        api.post('/auth/login', { email, password }),
    me: () => api.get('/auth/me'),
    changePassword: (currentPassword: string, newPassword: string) =>
        api.post('/auth/change-password', { currentPassword, newPassword }),
};

// Dashboard API
export const dashboardApi = {
    getStats: () => api.get('/dashboard/stats'),
};

// Partners API
export const partnersApi = {
    list: (params?: object) => api.get('/partners', { params }),
    get: (id: string) => api.get(`/partners/${id}`),
    create: (data: object) => api.post('/partners', data),
    update: (id: string, data: object) => api.put(`/partners/${id}`, data),
    delete: (id: string) => api.delete(`/partners/${id}`),
};

// Batches (MA) API
export const batchesApi = {
    list: (params?: object) => api.get('/batches', { params }),
    get: (id: string) => api.get(`/batches/${id}`),
    create: (data: object) => api.post('/batches', data),
    update: (id: string, data: object) => api.put(`/batches/${id}`, data),
    delete: (id: string) => api.delete(`/batches/${id}`),
    getAccounts: (id: string) => api.get(`/batches/${id}/accounts`),
    bulkUpdate: (ids: string[], status?: string, readiness?: number) =>
        api.post('/batches/bulk-update', { ids, status, readiness }),
};

// Invoice MCCs (MI) API
export const invoiceMCCsApi = {
    list: (params?: object) => api.get('/invoice-mccs', { params }),
    get: (id: string) => api.get(`/invoice-mccs/${id}`),
    create: (data: object) => api.post('/invoice-mccs', data),
    update: (id: string, data: object) => api.put(`/invoice-mccs/${id}`, data),
    delete: (id: string) => api.delete(`/invoice-mccs/${id}`),
    linkAccounts: (id: string, accountIds: string[]) =>
        api.post(`/invoice-mccs/${id}/link-accounts`, { accountIds }),
};

// Customers (MC) API
export const customersApi = {
    list: (params?: object) => api.get('/customers', { params }),
    get: (id: string) => api.get(`/customers/${id}`),
    create: (data: object) => api.post('/customers', data),
    update: (id: string, data: object) => api.put(`/customers/${id}`, data),
    delete: (id: string) => api.delete(`/customers/${id}`),
    assignAccounts: (id: string, accountIds: string[]) =>
        api.post(`/customers/${id}/assign-accounts`, { accountIds }),
};

// Accounts API
export const accountsApi = {
    list: (params?: object) => api.get('/accounts', { params }),
    get: (id: string) => api.get(`/accounts/${id}`),
    create: (data: object) => api.post('/accounts', data),
    update: (id: string, data: object) => api.put(`/accounts/${id}`, data),
    getUnlinked: () => api.get('/accounts/unlinked'),
    getUnassigned: () => api.get('/accounts/unassigned'),
    bulkUpdateStatus: (accountIds: string[], status: string) =>
        api.post('/accounts/bulk-update-status', { accountIds, status }),
    bulkUnlinkMi: (accountIds: string[]) =>
        api.post('/accounts/bulk-unlink-mi', { accountIds }),
    bulkUnassignMc: (accountIds: string[]) =>
        api.post('/accounts/bulk-unassign-mc', { accountIds }),
};

// Spending API
export const spendingApi = {
    getSnapshots: (params?: object) => api.get('/spending/snapshots', { params }),
    createSnapshot: (data: object) => api.post('/spending/snapshot', data),
    getRecords: (params?: object) => api.get('/spending/records', { params }),
    getCustomerSummary: (id: string, startDate?: string, endDate?: string) =>
        api.get(`/spending/summary/customer/${id}`, { params: { startDate, endDate } }),
    getInvoiceMCCSummary: (id: string, startDate?: string, endDate?: string) =>
        api.get(`/spending/summary/invoice-mcc/${id}`, { params: { startDate, endDate } }),
    getBatchSummary: (id: string, startDate?: string, endDate?: string) =>
        api.get(`/spending/summary/batch/${id}`, { params: { startDate, endDate } }),
    // ... existing methods
    getAccountChart: (accountId: string, startDate?: string, endDate?: string) =>
        api.get(`/spending/account/${accountId}/chart`, { params: { startDate, endDate } }),
    getGlobalChart: (startDate?: string, endDate?: string) =>
        api.get('/spending/chart', { params: { startDate, endDate } }),
};

// Import API
export const importApi = {
    importAccounts: (file: File, batchId: string) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('batchId', batchId);
        return api.post('/import/accounts', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },
    importSpending: (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        return api.post('/import/spending', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },
    parseBatch: (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        return api.post('/import/parse-batch', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },
    createBatchWithAccounts: (data: {
        mccAccountId: string | null;
        mccAccountName: string;
        timezone?: string | null;
        year?: number | null;
        readiness?: number;
        accounts: Array<{
            googleAccountId: string;
            accountName: string;
            status: string;
            currency: string;
        }>;
    }) => api.post('/import/create-batch-with-accounts', data),
    previewSpending: (file: File, spendingDate: string, miId?: string) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('spendingDate', spendingDate);
        if (miId) formData.append('miId', miId);
        return api.post('/import/spending/preview', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },
    confirmSpending: (spendingDate: string, batchId: string | null, data: object[], overwrite: boolean, miId?: string) =>
        api.post('/import/spending/confirm', { spendingDate, batchId, miId, data, overwrite }),
};

// Activity Logs API
export const activityLogsApi = {
    list: (params?: object) => api.get('/activity-logs', { params }),
    getEntityLogs: (entityType: string, entityId: string) =>
        api.get(`/activity-logs/entity/${entityType}/${entityId}`),
    get: (id: string) => api.get(`/activity-logs/${id}`),
    getStats: (days?: number) => api.get('/activity-logs/stats', { params: { days } }),
};

// Users API
export const usersApi = {
    list: (params?: object) => api.get('/users', { params }),
    listSimple: () => api.get('/users/simple'),
    get: (id: string) => api.get(`/users/${id}`),
    create: (data: object) => api.post('/auth/register', data),
    update: (id: string, data: object) => api.put(`/users/${id}`, data),
    delete: (id: string) => api.delete(`/users/${id}`),
    resetPassword: (id: string, newPassword: string) =>
        api.post(`/users/${id}/reset-password`, { newPassword }),
};

// Credit Linking API
export const creditLinkingApi = {
    suggest: (requirements: any[]) =>
        api.post('/credit-linking/suggest', { requirements }),
    execute: (data: any) =>
        api.post('/credit-linking/execute', data),
};

export default api;
