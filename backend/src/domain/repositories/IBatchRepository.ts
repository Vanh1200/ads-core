import { AccountBatch } from '../entities/AccountBatch';

export interface IBatchRepository {
    findById(id: string): Promise<AccountBatch | null>;
    list(params: { page: number; limit: number; status?: string; year?: number }): Promise<{ data: AccountBatch[]; total: number }>;
    create(data: Omit<AccountBatch, 'id' | 'createdAt' | 'updatedAt' | 'totalAccounts' | 'liveAccounts'>): Promise<AccountBatch>;
    update(id: string, data: Partial<AccountBatch>): Promise<AccountBatch>;
    updateMany(ids: string[], data: Partial<AccountBatch>): Promise<{ count: number }>;
    delete(id: string): Promise<void>;
    findAccountsByBatchId(batchId: string, params: any): Promise<{ data: any[]; total: number }>;
}
