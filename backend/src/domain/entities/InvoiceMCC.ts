export interface InvoiceMCC {
    id: string;
    name: string;
    mccInvoiceId: string;
    status: 'ACTIVE' | 'PENDING' | 'EXHAUSTED' | 'INACTIVE';
    creditStatus: 'PENDING' | 'CONNECTED' | 'FAILED';
    linkedAccountsCount: number;
    activeAccountsCount: number;
    notes: string | null;
    partnerId: string | null;
    createdById: string;
    createdAt: Date;
    updatedAt: Date;
    rangeSpending?: number;
}
