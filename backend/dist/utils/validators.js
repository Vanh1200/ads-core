"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paginationSchema = exports.assignMCSchema = exports.linkMISchema = exports.createSnapshotSchema = exports.createAccountSchema = exports.createCustomerSchema = exports.createInvoiceMCCSchema = exports.createBatchSchema = exports.createPartnerSchema = exports.registerSchema = exports.loginSchema = void 0;
const zod_1 = require("zod");
// Auth schemas
exports.loginSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email format'),
    password: zod_1.z.string().min(6, 'Password must be at least 6 characters'),
});
exports.registerSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email format'),
    password: zod_1.z.string().min(6, 'Password must be at least 6 characters'),
    fullName: zod_1.z.string().min(2, 'Full name is required'),
    role: zod_1.z.enum(['ADMIN', 'MANAGER', 'BUYER', 'LINKER', 'ASSIGNER', 'UPDATER', 'VIEWER']).optional(),
});
// Partner schemas
exports.createPartnerSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Partner name is required'),
    contactInfo: zod_1.z.string().nullable().optional(),
    type: zod_1.z.enum(['ACCOUNT_SUPPLIER', 'INVOICE_PROVIDER', 'BOTH']),
    notes: zod_1.z.string().nullable().optional(),
});
// AccountBatch (MA) schemas
exports.createBatchSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Batch name is required'),
    mccAccountName: zod_1.z.string().nullable().optional(),
    mccAccountId: zod_1.z.string().nullable().optional(),
    partnerId: zod_1.z.string().uuid().nullable().optional(),
    isPrelinked: zod_1.z.boolean().default(false),
    notes: zod_1.z.string().nullable().optional(),
});
// InvoiceMCC (MI) schemas
exports.createInvoiceMCCSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Invoice MCC name is required'),
    mccInvoiceId: zod_1.z.string().min(10, 'MCC Invoice ID is required'),
    partnerId: zod_1.z.string().uuid().nullable().optional(),
    notes: zod_1.z.string().nullable().optional(),
});
// Customer (MC) schemas
exports.createCustomerSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Customer name is required'),
    contactInfo: zod_1.z.string().nullable().optional(),
    assignedStaffId: zod_1.z.string().uuid().nullable().optional(),
    notes: zod_1.z.string().nullable().optional(),
});
// Account schemas
exports.createAccountSchema = zod_1.z.object({
    googleAccountId: zod_1.z.string().regex(/^\d{3}-\d{3}-\d{4}$/, 'Account ID must be in format xxx-xxx-xxxx'),
    accountName: zod_1.z.string().min(1, 'Account name is required'),
    batchId: zod_1.z.string().uuid('Batch ID is required'),
    currency: zod_1.z.string().default('USD'),
    timezone: zod_1.z.string().optional(),
    status: zod_1.z.enum(['ACTIVE', 'INACTIVE', 'DIED']).default('ACTIVE'),
});
// Spending snapshot schemas
exports.createSnapshotSchema = zod_1.z.object({
    accountId: zod_1.z.string().uuid(),
    spendingDate: zod_1.z.string().transform((str) => new Date(str)),
    cumulativeAmount: zod_1.z.number().min(0),
    snapshotType: zod_1.z.enum(['MI_CHANGE', 'MC_CHANGE', 'DAILY_FINAL']),
});
// Link/Assign schemas
exports.linkMISchema = zod_1.z.object({
    accountIds: zod_1.z.array(zod_1.z.string().uuid()).min(1, 'At least one account required'),
    invoiceMccId: zod_1.z.string().uuid('Invoice MCC ID is required'),
});
exports.assignMCSchema = zod_1.z.object({
    accountIds: zod_1.z.array(zod_1.z.string().uuid()).min(1, 'At least one account required'),
    customerId: zod_1.z.string().uuid('Customer ID is required'),
});
// Pagination schema
exports.paginationSchema = zod_1.z.object({
    page: zod_1.z.coerce.number().min(1).default(1),
    limit: zod_1.z.coerce.number().min(1).max(10000).default(20),
    search: zod_1.z.string().optional(),
    sortBy: zod_1.z.string().optional(),
    sortOrder: zod_1.z.enum(['asc', 'desc']).default('desc'),
});
//# sourceMappingURL=validators.js.map