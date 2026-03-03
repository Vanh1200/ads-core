import { Account } from '../entities/Account';

export interface IAccountRepository {
    findIdsByFilter(params: {
        q?: string;
        status?: string;
        batchId?: string;
        miId?: string;
        mcId?: string;
    }): Promise<{ id: string; googleAccountId: string }[]>;
    findById(id: string): Promise<Account | null>;
    findByGoogleId(googleAccountId: string): Promise<Account | null>;
    list(params: {
        page: number;
        limit: number;
        q?: string;
        status?: string;
        batchId?: string;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
        ids?: string[];
        startDate?: Date;
        endDate?: Date;
    }): Promise<{ data: Account[]; total: number }>;
    create(data: Omit<Account, 'id' | 'createdAt' | 'updatedAt' | 'totalSpending'>): Promise<Account>;
    update(id: string, data: Partial<Account>): Promise<Account>;
    updateMany(ids: string[], data: Partial<Account>): Promise<{ count: number }>;
    findUnlinked(): Promise<Account[]>;
    findUnassigned(): Promise<Account[]>;
}
