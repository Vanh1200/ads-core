export type PartnerType = 'ACCOUNT_SUPPLIER' | 'INVOICE_PROVIDER' | 'BOTH';

export interface PartnerDTO {
    id: string;
    name: string;
    contactInfo?: string | null;
    type: PartnerType;
    notes?: string | null;
    createdAt: Date;
}

export interface CreatePartnerDTO {
    name: string;
    type: PartnerType;
    contactInfo?: string;
    notes?: string;
}

export interface UpdatePartnerDTO {
    name?: string;
    type?: PartnerType;
    contactInfo?: string;
    notes?: string;
}
