export interface Partner {
    id: string;
    name: string;
    contactInfo?: string | null;
    type: 'ACCOUNT_SUPPLIER' | 'INVOICE_PROVIDER' | 'BOTH';
    notes?: string | null;
    createdAt: Date;
}
