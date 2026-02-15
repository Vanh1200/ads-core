import { z } from 'zod';

// Auth schemas
export const loginSchema = z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const registerSchema = z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    fullName: z.string().min(2, 'Full name is required'),
    role: z.enum(['ADMIN', 'MANAGER', 'BUYER', 'LINKER', 'ASSIGNER', 'UPDATER', 'VIEWER']).optional(),
});

// Partner schemas
export const createPartnerSchema = z.object({
    name: z.string().min(2, 'Partner name is required'),
    contactInfo: z.string().nullable().optional(),
    type: z.enum(['ACCOUNT_SUPPLIER', 'INVOICE_PROVIDER', 'BOTH']),
    notes: z.string().nullable().optional(),
});

// AccountBatch (MA) schemas
export const createBatchSchema = z.object({
    mccAccountName: z.string().min(2, 'MCC Account name is required'),
    mccAccountId: z.string().nullable().optional(),
    partnerId: z.string().uuid().nullable().optional(),
    isPrelinked: z.boolean().default(false),
    timezone: z.string().nullable().optional(),
    year: z.number().nullable().optional(),
    isMixYear: z.boolean().default(false),
    readiness: z.number().min(0).max(10).default(0),
    notes: z.string().nullable().optional(),
});

// InvoiceMCC (MI) schemas
export const createInvoiceMCCSchema = z.object({
    name: z.string().min(2, 'Invoice MCC name is required'),
    mccInvoiceId: z.string().min(10, 'MCC Invoice ID is required'),
    partnerId: z.string().uuid().nullable().optional(),
    notes: z.string().nullable().optional(),
});

// Customer (MC) schemas
export const createCustomerSchema = z.object({
    name: z.string().min(2, 'Customer name is required'),
    contactInfo: z.string().nullable().optional(),
    assignedStaffId: z.string().uuid().nullable().optional(),
    notes: z.string().nullable().optional(),
});

// Account schemas
export const createAccountSchema = z.object({
    googleAccountId: z.string().regex(/^\d{3}-\d{3}-\d{4}$/, 'Account ID must be in format xxx-xxx-xxxx'),
    accountName: z.string().min(1, 'Account name is required'),
    batchId: z.string().uuid('Batch ID is required'),
    currency: z.string().default('USD'),
    timezone: z.string().optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

// Spending snapshot schemas
export const createSnapshotSchema = z.object({
    accountId: z.string().uuid(),
    spendingDate: z.string().transform((str) => new Date(str)),
    cumulativeAmount: z.number().min(0),
    snapshotType: z.enum(['MI_CHANGE', 'MC_CHANGE', 'DAILY_FINAL']),
});

// Link/Assign schemas
export const linkMISchema = z.object({
    accountIds: z.array(z.string().uuid()).min(1, 'At least one account required'),
    invoiceMccId: z.string().uuid('Invoice MCC ID is required'),
});

export const assignMCSchema = z.object({
    accountIds: z.array(z.string().uuid()).min(1, 'At least one account required'),
    customerId: z.string().uuid('Customer ID is required'),
});

// Quick Link schemas
export const quickLinkSuggestSchema = z.object({
    requirements: z.array(z.object({
        timezone: z.string(),
        currency: z.string(),
        year: z.number(),
        count: z.number().min(1),
    })).min(1, 'At least one requirement required'),
});

export const quickLinkExecuteSchema = z.object({
    links: z.array(z.object({
        requirementId: z.string(), // To match with suggestions if needed
        batchId: z.string().uuid(),
        accountIds: z.array(z.string().uuid()).min(1),
    })).min(1),
    invoiceMccId: z.string().uuid().optional(), // Existing MI
    newInvoiceMcc: z.object({ // New MI option
        name: z.string().min(2),
        mccInvoiceId: z.string().min(10),
        partnerId: z.string().uuid().nullable().optional(),
    }).optional(),
});

// Pagination schema
export const paginationSchema = z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(10000).default(20),
    search: z.string().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
    ids: z.union([z.string(), z.array(z.string())]).optional().transform(val => {
        if (!val) return undefined;
        const array = Array.isArray(val) ? val : [val];
        return array.flatMap(s => s.split(/[\n,]+/).map(i => i.trim()).filter(Boolean));
    }),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreatePartnerInput = z.infer<typeof createPartnerSchema>;
export type CreateBatchInput = z.infer<typeof createBatchSchema>;
export type CreateInvoiceMCCInput = z.infer<typeof createInvoiceMCCSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type CreateSnapshotInput = z.infer<typeof createSnapshotSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
