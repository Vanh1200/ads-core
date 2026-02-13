export type BatchStatus = 'ACTIVE' | 'INACTIVE';

export interface BatchDTO {
    id: string;
    mccAccountName?: string | null;
    mccAccountId?: string | null;
    isPrelinked: boolean;
    status: BatchStatus;
    totalAccounts: number;
    liveAccounts: number;
    timezone?: string | null;
    year?: number | null;
    readiness: number;
    notes?: string | null;
    partnerId?: string | null;
    createdById: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateBatchDTO {
    mccAccountName: string;
    mccAccountId?: string;
    isPrelinked?: boolean;
    timezone?: string;
    year?: number;
    readiness?: number;
    notes?: string;
    partnerId?: string;
}

export interface UpdateBatchDTO {
    mccAccountName?: string;
    status?: BatchStatus;
    timezone?: string;
    year?: number;
    readiness?: number;
    notes?: string;
    partnerId?: string;
}
