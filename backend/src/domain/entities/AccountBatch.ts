export interface AccountBatch {
    id: string;
    mccAccountName?: string | null;
    mccAccountId?: string | null;
    isPrelinked: boolean;
    status: 'ACTIVE' | 'INACTIVE';
    totalAccounts: number;
    liveAccounts: number;
    timezone?: string | null;
    year?: number | null;
    isMixYear: boolean;
    readiness: number;
    notes?: string | null;
    partnerId?: string | null;
    createdById: string;
    createdAt: Date;
    updatedAt: Date;
    rangeSpending?: number;
}
