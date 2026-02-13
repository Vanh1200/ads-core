export interface Account {
    id: string;
    googleAccountId: string;
    accountName: string;
    status: 'ACTIVE' | 'INACTIVE';
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
