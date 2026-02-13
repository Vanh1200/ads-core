export type InvoiceMCCStatus = 'ACTIVE' | 'PENDING' | 'EXHAUSTED' | 'INACTIVE';
export type CreditStatus = 'PENDING' | 'CONNECTED' | 'FAILED';

export interface InvoiceMCC {
    id: string;
    name: string;
    mccInvoiceId: string;
    status: InvoiceMCCStatus;
    creditStatus: CreditStatus;
    linkedAccountsCount: number;
    activeAccountsCount: number;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    partnerId: string | null;
    createdById: string;
}
