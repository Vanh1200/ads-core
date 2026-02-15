import { Partner } from '../entities/Partner';

export interface IPartnerRepository {
    findById(id: string): Promise<Partner | null>;
    list(params: {
        page: number;
        limit: number;
        q?: string;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
    }): Promise<{ data: Partner[]; total: number }>;
    create(data: Omit<Partner, 'id' | 'createdAt'>): Promise<Partner>;
    update(id: string, data: Partial<Partner>): Promise<Partner>;
    delete(id: string): Promise<void>;
}
