export interface SpendingRecord {
    id: string;
    spendingDate: Date;
    amount: number;
    currency: string;
    periodStart: Date;
    periodEnd: Date;
    createdAt: Date;
    accountId: string;
    invoiceMccId: string | null;
    customerId: string | null;
}

export type SnapshotType = 'MI_CHANGE' | 'MC_CHANGE' | 'DAILY_FINAL';

export interface SpendingSnapshot {
    id: string;
    spendingDate: Date;
    cumulativeAmount: number;
    snapshotAt: Date;
    snapshotType: SnapshotType;
    createdAt: Date;
    accountId: string;
    invoiceMccId: string | null;
    customerId: string | null;
    createdById: string;
}
