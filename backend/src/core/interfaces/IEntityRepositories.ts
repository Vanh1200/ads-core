export interface IBatchRepository {
    findMany(params: {
        page: number;
        limit: number;
        search?: string;
        status?: string;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
    }): Promise<{ data: any[]; total: number }>;

    findById(id: string): Promise<any | null>;
    create(data: any): Promise<any>;
    update(id: string, data: any): Promise<any>;
    delete(id: string): Promise<void>;
    updateCounts(batchId: string): Promise<void>;
    bulkUpdate(ids: string[], data: any): Promise<number>;
}

export interface ICustomerRepository {
    findMany(params: {
        page: number;
        limit: number;
        search?: string;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
    }): Promise<{ data: any[]; total: number }>;

    findById(id: string): Promise<any | null>;
    create(data: any): Promise<any>;
    update(id: string, data: any): Promise<any>;
    delete(id: string): Promise<void>;
    updateCounts(customerId: string): Promise<void>;
}

export interface IInvoiceMCCRepository {
    findMany(params: {
        page: number;
        limit: number;
        search?: string;
        status?: string;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
    }): Promise<{ data: any[]; total: number }>;

    findById(id: string): Promise<any | null>;
    findByMccId(mccInvoiceId: string): Promise<any | null>;
    create(data: any): Promise<any>;
    update(id: string, data: any): Promise<any>;
    delete(id: string): Promise<void>;
    updateCounts(invoiceMccId: string): Promise<void>;
}
