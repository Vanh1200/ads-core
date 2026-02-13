import { Customer } from '../entities/Customer';

export interface ICustomerRepository {
    findById(id: string): Promise<Customer | null>;
    findByName(name: string): Promise<Customer | null>;
    list(params: { page: number; limit: number; q?: string; status?: string }): Promise<{ data: Customer[]; total: number }>;
    create(data: Omit<Customer, 'id' | 'createdAt' | 'updatedAt' | 'totalSpending' | 'totalAccounts' | 'activeAccounts'>): Promise<Customer>;
    update(id: string, data: Partial<Customer>): Promise<Customer>;
    delete(id: string): Promise<void>;
}
