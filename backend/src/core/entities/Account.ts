// Pure domain types — NO dependency on Prisma or Express

export type AccountStatus = 'ACTIVE' | 'INACTIVE';

export interface Account {
    id: string;
    googleAccountId: string;
    accountName: string;
    status: AccountStatus;
    currency: string;
    timezone?: string | null;
    mccAccountName?: string | null;
    mccAccountId?: string | null;
    totalSpending: number;
    lastSynced?: Date | null;
    createdAt: Date;
    updatedAt: Date;
    batchId: string;
    currentMiId?: string | null;
    currentMcId?: string | null;
}

export interface AccountWithRelations extends Account {
    batch?: { id: string; mccAccountName: string | null; mccAccountId: string | null };
    currentMi?: { id: string; name: string; mccInvoiceId?: string } | null;
    currentMc?: { id: string; name: string } | null;
}

export interface CreateAccountInput {
    googleAccountId: string;
    accountName: string;
    batchId: string;
    currency?: string;
    timezone?: string;
    status?: AccountStatus;
    mccAccountName?: string | null;
    mccAccountId?: string | null;
}
