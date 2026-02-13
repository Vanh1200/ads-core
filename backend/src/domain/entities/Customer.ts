export interface Customer {
    id: string;
    name: string;
    contactInfo: string | null;
    status: 'ACTIVE' | 'INACTIVE';
    totalSpending: number;
    totalAccounts: number;
    activeAccounts: number;
    notes: string | null;
    assignedStaffId: string | null;
    createdAt: Date;
    updatedAt: Date;
}
