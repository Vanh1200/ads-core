export type PartnerType = 'ACCOUNT_SUPPLIER' | 'INVOICE_PROVIDER' | 'BOTH';

export interface Partner {
    id: string;
    name: string;
    contactInfo: string | null;
    type: PartnerType;
    notes: string | null;
    createdAt: Date;
}
