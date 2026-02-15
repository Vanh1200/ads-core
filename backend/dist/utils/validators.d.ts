import { z } from 'zod';
export declare const loginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
}, {
    email: string;
    password: string;
}>;
export declare const registerSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
    fullName: z.ZodString;
    role: z.ZodOptional<z.ZodEnum<["ADMIN", "MANAGER", "BUYER", "LINKER", "ASSIGNER", "UPDATER", "VIEWER"]>>;
}, "strip", z.ZodTypeAny, {
    email: string;
    fullName: string;
    password: string;
    role?: "ADMIN" | "MANAGER" | "BUYER" | "LINKER" | "ASSIGNER" | "UPDATER" | "VIEWER" | undefined;
}, {
    email: string;
    fullName: string;
    password: string;
    role?: "ADMIN" | "MANAGER" | "BUYER" | "LINKER" | "ASSIGNER" | "UPDATER" | "VIEWER" | undefined;
}>;
export declare const createPartnerSchema: z.ZodObject<{
    name: z.ZodString;
    contactInfo: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    type: z.ZodEnum<["ACCOUNT_SUPPLIER", "INVOICE_PROVIDER", "BOTH"]>;
    notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    type: "ACCOUNT_SUPPLIER" | "INVOICE_PROVIDER" | "BOTH";
    contactInfo?: string | null | undefined;
    notes?: string | null | undefined;
}, {
    name: string;
    type: "ACCOUNT_SUPPLIER" | "INVOICE_PROVIDER" | "BOTH";
    contactInfo?: string | null | undefined;
    notes?: string | null | undefined;
}>;
export declare const createBatchSchema: z.ZodObject<{
    mccAccountName: z.ZodString;
    mccAccountId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    partnerId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    isPrelinked: z.ZodDefault<z.ZodBoolean>;
    timezone: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    year: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    isMixYear: z.ZodDefault<z.ZodBoolean>;
    readiness: z.ZodDefault<z.ZodNumber>;
    notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    mccAccountName: string;
    isPrelinked: boolean;
    isMixYear: boolean;
    readiness: number;
    year?: number | null | undefined;
    notes?: string | null | undefined;
    mccAccountId?: string | null | undefined;
    partnerId?: string | null | undefined;
    timezone?: string | null | undefined;
}, {
    mccAccountName: string;
    year?: number | null | undefined;
    notes?: string | null | undefined;
    mccAccountId?: string | null | undefined;
    partnerId?: string | null | undefined;
    isPrelinked?: boolean | undefined;
    timezone?: string | null | undefined;
    isMixYear?: boolean | undefined;
    readiness?: number | undefined;
}>;
export declare const createInvoiceMCCSchema: z.ZodObject<{
    name: z.ZodString;
    mccInvoiceId: z.ZodString;
    partnerId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    mccInvoiceId: string;
    notes?: string | null | undefined;
    partnerId?: string | null | undefined;
}, {
    name: string;
    mccInvoiceId: string;
    notes?: string | null | undefined;
    partnerId?: string | null | undefined;
}>;
export declare const createCustomerSchema: z.ZodObject<{
    name: z.ZodString;
    contactInfo: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    assignedStaffId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    contactInfo?: string | null | undefined;
    notes?: string | null | undefined;
    assignedStaffId?: string | null | undefined;
}, {
    name: string;
    contactInfo?: string | null | undefined;
    notes?: string | null | undefined;
    assignedStaffId?: string | null | undefined;
}>;
export declare const createAccountSchema: z.ZodObject<{
    googleAccountId: z.ZodString;
    accountName: z.ZodString;
    batchId: z.ZodString;
    currency: z.ZodDefault<z.ZodString>;
    timezone: z.ZodOptional<z.ZodString>;
    status: z.ZodDefault<z.ZodEnum<["ACTIVE", "INACTIVE"]>>;
}, "strip", z.ZodTypeAny, {
    status: "ACTIVE" | "INACTIVE";
    googleAccountId: string;
    accountName: string;
    batchId: string;
    currency: string;
    timezone?: string | undefined;
}, {
    googleAccountId: string;
    accountName: string;
    batchId: string;
    status?: "ACTIVE" | "INACTIVE" | undefined;
    timezone?: string | undefined;
    currency?: string | undefined;
}>;
export declare const createSnapshotSchema: z.ZodObject<{
    accountId: z.ZodString;
    spendingDate: z.ZodEffects<z.ZodString, Date, string>;
    cumulativeAmount: z.ZodNumber;
    snapshotType: z.ZodEnum<["MI_CHANGE", "MC_CHANGE", "DAILY_FINAL"]>;
}, "strip", z.ZodTypeAny, {
    accountId: string;
    spendingDate: Date;
    cumulativeAmount: number;
    snapshotType: "MI_CHANGE" | "MC_CHANGE" | "DAILY_FINAL";
}, {
    accountId: string;
    spendingDate: string;
    cumulativeAmount: number;
    snapshotType: "MI_CHANGE" | "MC_CHANGE" | "DAILY_FINAL";
}>;
export declare const linkMISchema: z.ZodObject<{
    accountIds: z.ZodArray<z.ZodString, "many">;
    invoiceMccId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    accountIds: string[];
    invoiceMccId: string;
}, {
    accountIds: string[];
    invoiceMccId: string;
}>;
export declare const assignMCSchema: z.ZodObject<{
    accountIds: z.ZodArray<z.ZodString, "many">;
    customerId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    accountIds: string[];
    customerId: string;
}, {
    accountIds: string[];
    customerId: string;
}>;
export declare const quickLinkSuggestSchema: z.ZodObject<{
    requirements: z.ZodArray<z.ZodObject<{
        timezone: z.ZodString;
        currency: z.ZodString;
        year: z.ZodNumber;
        count: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        year: number;
        timezone: string;
        currency: string;
        count: number;
    }, {
        year: number;
        timezone: string;
        currency: string;
        count: number;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    requirements: {
        year: number;
        timezone: string;
        currency: string;
        count: number;
    }[];
}, {
    requirements: {
        year: number;
        timezone: string;
        currency: string;
        count: number;
    }[];
}>;
export declare const quickLinkExecuteSchema: z.ZodObject<{
    links: z.ZodArray<z.ZodObject<{
        requirementId: z.ZodString;
        batchId: z.ZodString;
        accountIds: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        batchId: string;
        accountIds: string[];
        requirementId: string;
    }, {
        batchId: string;
        accountIds: string[];
        requirementId: string;
    }>, "many">;
    invoiceMccId: z.ZodOptional<z.ZodString>;
    newInvoiceMcc: z.ZodOptional<z.ZodObject<{
        name: z.ZodString;
        mccInvoiceId: z.ZodString;
        partnerId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        mccInvoiceId: string;
        partnerId?: string | null | undefined;
    }, {
        name: string;
        mccInvoiceId: string;
        partnerId?: string | null | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    links: {
        batchId: string;
        accountIds: string[];
        requirementId: string;
    }[];
    invoiceMccId?: string | undefined;
    newInvoiceMcc?: {
        name: string;
        mccInvoiceId: string;
        partnerId?: string | null | undefined;
    } | undefined;
}, {
    links: {
        batchId: string;
        accountIds: string[];
        requirementId: string;
    }[];
    invoiceMccId?: string | undefined;
    newInvoiceMcc?: {
        name: string;
        mccInvoiceId: string;
        partnerId?: string | null | undefined;
    } | undefined;
}>;
export declare const paginationSchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    search: z.ZodOptional<z.ZodString>;
    sortBy: z.ZodOptional<z.ZodString>;
    sortOrder: z.ZodDefault<z.ZodEnum<["asc", "desc"]>>;
    ids: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>>, string[] | undefined, string | string[] | undefined>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    sortOrder: "asc" | "desc";
    search?: string | undefined;
    sortBy?: string | undefined;
    ids?: string[] | undefined;
}, {
    search?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    sortBy?: string | undefined;
    sortOrder?: "asc" | "desc" | undefined;
    ids?: string | string[] | undefined;
}>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreatePartnerInput = z.infer<typeof createPartnerSchema>;
export type CreateBatchInput = z.infer<typeof createBatchSchema>;
export type CreateInvoiceMCCInput = z.infer<typeof createInvoiceMCCSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type CreateSnapshotInput = z.infer<typeof createSnapshotSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
