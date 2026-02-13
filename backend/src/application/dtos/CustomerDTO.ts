export interface CustomerDTO {
    id: string;
    name: string;
    contactInfo: string | null;
    status: 'ACTIVE' | 'INACTIVE';
    totalSpending: number;
    totalAccounts: number;
    activeAccounts: number;
    notes: string | null;
    assignedStaff?: { id: string; fullName: string };
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateCustomerDTO {
    name: string;
    contactInfo?: string;
    notes?: string;
    assignedStaffId?: string;
}

export interface UpdateCustomerDTO {
    name?: string;
    contactInfo?: string;
    status?: 'ACTIVE' | 'INACTIVE';
    notes?: string;
    assignedStaffId?: string;
}
