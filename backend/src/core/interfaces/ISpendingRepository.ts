export interface ISpendingRepository {
    getRecords(params: {
        accountId?: string;
        startDate?: Date;
        endDate?: Date;
        page?: number;
        limit?: number;
    }): Promise<{ data: any[]; total: number }>;

    createRecord(data: {
        accountId: string;
        spendingDate: Date;
        amount: number;
        currency: string;
        invoiceMccId?: string | null;
        customerId?: string | null;
        periodStart: Date;
        periodEnd: Date;
    }): Promise<any>;

    updateRecord(id: string, data: { amount: number }): Promise<any>;

    findRecordsByAccountAndDate(
        accountId: string,
        date: Date
    ): Promise<any[]>;

    getAggregateSpending(accountId: string): Promise<number>;

    getChartData(params: {
        accountId?: string;
        startDate?: Date;
        endDate?: Date;
    }): Promise<any[]>;

    getEntitySummary(params: {
        entityType: 'customer' | 'invoice-mcc' | 'batch';
        entityId: string;
        startDate?: Date;
        endDate?: Date;
    }): Promise<any>;
}
