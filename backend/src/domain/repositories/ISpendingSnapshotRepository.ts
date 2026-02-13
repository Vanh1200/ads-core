export interface SpendingSnapshot {
    id: string;
    spendingDate: Date;
    cumulativeAmount: number;
    snapshotAt: Date;
    snapshotType: 'MI_CHANGE' | 'MC_CHANGE' | 'DAILY_FINAL';
    accountId: string;
    invoiceMccId: string | null;
    customerId: string | null;
    createdById: string;
    createdAt: Date;
}

export interface ISpendingSnapshotRepository {
    findById(id: string): Promise<SpendingSnapshot | null>;
    list(params: { page: number; limit: number; accountId?: string; date?: Date }): Promise<{ data: SpendingSnapshot[]; total: number }>;
    create(data: Omit<SpendingSnapshot, 'id' | 'createdAt'>): Promise<SpendingSnapshot>;
    findByAccountAndDate(accountId: string, date: Date): Promise<SpendingSnapshot[]>;
}
