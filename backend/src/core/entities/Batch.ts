export type BatchStatus = 'ACTIVE' | 'INACTIVE';

export interface Batch {
    id: string;
    mccAccountName: string | null;
    mccAccountId: string | null;
    isPrelinked: boolean;
    status: BatchStatus;
    totalAccounts: number;
    liveAccounts: number;
    timezone: string | null;
    year: number | null;
    readiness: number;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    partnerId: string | null;
    createdById: string;
}
