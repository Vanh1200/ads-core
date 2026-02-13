import { SpendingRecord } from '../entities/SpendingRecord';

export interface ISpendingRepository {
    findByAccountAndDate(accountId: string, date: Date): Promise<SpendingRecord | null>;
    findLatestByAccount(accountId: string): Promise<SpendingRecord | null>;
    upsert(data: Omit<SpendingRecord, 'id' | 'createdAt'>): Promise<SpendingRecord>;
    getDailyStats(params: { startDate: Date; endDate: Date }): Promise<any[]>;
    getSummary(params: any): Promise<any>;
}
