import { InvoiceMCC } from '../entities/InvoiceMCC';

export interface IInvoiceMCCRepository {
    findById(id: string): Promise<InvoiceMCC | null>;
    findByMccId(mccInvoiceId: string): Promise<InvoiceMCC | null>;
    list(params: {
        page: number;
        limit: number;
        q?: string;
        status?: string;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
        startDate?: Date;
        endDate?: Date;
    }): Promise<{ data: InvoiceMCC[]; total: number }>;
    create(data: Omit<InvoiceMCC, 'id' | 'createdAt' | 'updatedAt' | 'linkedAccountsCount' | 'activeAccountsCount'>): Promise<InvoiceMCC>;
    update(id: string, data: Partial<InvoiceMCC>): Promise<InvoiceMCC>;
    delete(id: string): Promise<void>;
    syncCounts(id: string): Promise<void>;
}
