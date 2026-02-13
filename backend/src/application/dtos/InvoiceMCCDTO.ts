export interface InvoiceMCCDTO {
    id: string;
    name: string;
    mccInvoiceId: string;
    status: 'ACTIVE' | 'PENDING' | 'EXHAUSTED' | 'INACTIVE';
    creditStatus: 'PENDING' | 'CONNECTED' | 'FAILED';
    linkedAccountsCount: number;
    activeAccountsCount: number;
    notes: string | null;
    partner?: { id: string; name: string };
    createdAt: Date;
}

export interface CreateInvoiceMCCDTO {
    name: string;
    mccInvoiceId: string;
    partnerId?: string;
    notes?: string;
}

export interface UpdateInvoiceMCCDTO {
    name?: string;
    status?: 'ACTIVE' | 'PENDING' | 'EXHAUSTED' | 'INACTIVE';
    creditStatus?: 'PENDING' | 'CONNECTED' | 'FAILED';
    partnerId?: string;
    notes?: string;
}
