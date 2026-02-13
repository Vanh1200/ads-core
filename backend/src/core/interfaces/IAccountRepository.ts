import { Account, AccountWithRelations, CreateAccountInput } from '../entities/Account';

export interface PaginationParams {
    page: number;
    limit: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

export interface AccountFilters {
    status?: string;
    batchId?: string;
    miId?: string;
    mcId?: string;
    ids?: string[];
}

export interface PaginatedResult<T> {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

export interface IAccountRepository {
    findMany(
        pagination: PaginationParams,
        filters: AccountFilters,
        orderBy: any
    ): Promise<{ accounts: AccountWithRelations[]; total: number }>;

    findById(id: string): Promise<AccountWithRelations | null>;
    findByGoogleId(googleAccountId: string): Promise<Account | null>;
    findUnlinked(): Promise<AccountWithRelations[]>;
    findUnassigned(): Promise<AccountWithRelations[]>;

    create(data: CreateAccountInput): Promise<AccountWithRelations>;
    update(id: string, data: Partial<Account>): Promise<Account>;
    delete(id: string): Promise<void>;

    bulkUpdateStatus(ids: string[], status: string): Promise<number>;
    bulkUnlinkMi(ids: string[]): Promise<number>;
    bulkUnassignMc(ids: string[]): Promise<number>;

    getSpendingAggregation(
        accountIds: string[],
        startDate: Date
    ): Promise<Record<string, number>>;

    countByBatch(batchId: string): Promise<{ total: number; active: number }>;
}
