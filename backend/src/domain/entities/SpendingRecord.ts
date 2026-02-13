export interface SpendingRecord {
    id: string;
    spendingDate: Date;
    amount: number;
    currency: string;
    periodStart: Date;
    periodEnd: Date;
    accountId: string;
    invoiceMccId: string | null;
    customerId: string | null;
    createdAt: Date;
}
