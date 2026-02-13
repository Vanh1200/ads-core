export interface AccountDTO {
    id: string;
    googleAccountId: string;
    accountName: string;
    status: 'ACTIVE' | 'INACTIVE';
    currency: string;
    totalSpending: number;
    lastSynced: Date;
    batchId?: string | null;
    currentMiId?: string | null;
    currentMcId?: string | null;
}

export interface CreateAccountDTO {
    googleAccountId: string;
    accountName: string;
    status?: 'ACTIVE' | 'INACTIVE';
    currency?: string;
    batchId?: string;
}

export interface UpdateAccountDTO {
    accountName?: string;
    status?: 'ACTIVE' | 'INACTIVE';
    currentMiId?: string | null;
    currentMcId?: string | null;
}
