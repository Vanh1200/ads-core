export type CustomerStatus = 'ACTIVE' | 'INACTIVE';

export interface Customer {
    id: string;
    name: string;
    contactInfo: string | null;
    status: CustomerStatus;
    totalSpending: number;
    totalAccounts: number;
    activeAccounts: number;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    assignedStaffId: string | null;
}
