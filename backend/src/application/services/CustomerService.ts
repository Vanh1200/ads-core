import { ICustomerRepository } from '../../domain/repositories/ICustomerRepository';
import { customerRepository } from '../../infrastructure/database/repositories/PrismaCustomerRepository';
import { accountRepository } from '../../infrastructure/database/repositories/PrismaAccountRepository';
import { logActivity } from '../../infrastructure/logging/ActivityLogger';

export class CustomerService {
    constructor(private readonly customerRepo: ICustomerRepository = customerRepository) { }

    async list(params: any) {
        return this.customerRepo.list(params);
    }

    async getById(id: string) {
        const customer = await this.customerRepo.findById(id);
        if (!customer) throw new Error('NOT_FOUND: Khách hàng không tồn tại');
        return customer;
    }

    async create(data: any, userId: string, ipAddress?: string) {
        const customer = await this.customerRepo.create(data);
        await logActivity({
            userId,
            action: 'CREATE',
            entityType: 'Customer',
            entityId: customer.id,
            newValues: customer,
            description: `Tạo khách hàng: ${customer.name}`,
            ipAddress
        });
        return customer;
    }

    async update(id: string, data: any, userId: string, ipAddress?: string) {
        const oldCustomer = await this.customerRepo.findById(id);
        if (!oldCustomer) throw new Error('NOT_FOUND: Khách hàng không tồn tại');

        const customer = await this.customerRepo.update(id, data);
        await logActivity({
            userId,
            action: 'UPDATE',
            entityType: 'Customer',
            entityId: id,
            oldValues: oldCustomer,
            newValues: customer,
            description: `Cập nhật khách hàng: ${customer.name}`,
            ipAddress
        });
        return customer;
    }

    async delete(id: string, userId: string, ipAddress?: string) {
        const customer = await this.customerRepo.findById(id);
        if (!customer) throw new Error('NOT_FOUND: Khách hàng không tồn tại');

        await this.customerRepo.delete(id);
        await logActivity({
            userId,
            action: 'DELETE',
            entityType: 'Customer',
            entityId: id,
            oldValues: customer,
            description: `Xóa khách hàng: ${customer.name}`,
            ipAddress
        });
        return { message: 'Xóa khách hàng thành công' };
    }

    async assignAccounts(id: string, accountIds: string[], userId: string, ipAddress?: string) {
        const customer = await this.customerRepo.findById(id);
        if (!customer) throw new Error('NOT_FOUND: Khách hàng không tồn tại');

        await accountRepository.updateMany(accountIds, { currentMcId: id });

        await logActivity({
            userId,
            action: 'ASSIGN_MC',
            entityType: 'Customer',
            entityId: id,
            newValues: { accountIds },
            description: `Gán ${accountIds.length} tài khoản cho khách hàng: ${customer.name}`,
            ipAddress
        });
        return { message: 'Gán tài khoản thành công' };
    }
}

export const customerService = new CustomerService();
