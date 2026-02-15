import { IInvoiceMCCRepository } from '../../domain/repositories/IInvoiceMCCRepository';
import { invoiceMCCRepository } from '../../infrastructure/database/repositories/PrismaInvoiceMCCRepository';
import { accountRepository } from '../../infrastructure/database/repositories/PrismaAccountRepository';
import { logActivity } from '../../infrastructure/logging/ActivityLogger';

export class InvoiceMCCService {
    constructor(private readonly invoiceMCCRepo: IInvoiceMCCRepository = invoiceMCCRepository) { }

    async list(params: any) {
        return this.invoiceMCCRepo.list(params);
    }

    async getById(id: string) {
        const mi = await this.invoiceMCCRepo.findById(id);
        if (!mi) throw new Error('NOT_FOUND: Invoice MCC không tồn tại');
        return mi;
    }

    async create(data: any, userId: string, ipAddress?: string) {
        const mi = await this.invoiceMCCRepo.create({ ...data, createdById: userId });
        await logActivity({
            userId,
            action: 'CREATE',
            entityType: 'InvoiceMCC',
            entityId: mi.id,
            newValues: mi,
            description: `Tạo MI: ${mi.name}`,
            ipAddress
        });
        return mi;
    }

    async update(id: string, data: any, userId: string, ipAddress?: string) {
        const oldMi = await this.invoiceMCCRepo.findById(id);
        if (!oldMi) throw new Error('NOT_FOUND: Invoice MCC không tồn tại');

        const mi = await this.invoiceMCCRepo.update(id, data);
        await logActivity({
            userId,
            action: 'UPDATE',
            entityType: 'InvoiceMCC',
            entityId: id,
            oldValues: oldMi,
            newValues: mi,
            description: `Cập nhật MI: ${mi.name}`,
            ipAddress
        });
        return mi;
    }

    async delete(id: string, userId: string, ipAddress?: string) {
        const mi = await this.invoiceMCCRepo.findById(id);
        if (!mi) throw new Error('NOT_FOUND: Invoice MCC không tồn tại');

        await this.invoiceMCCRepo.delete(id);
        await logActivity({
            userId,
            action: 'DELETE',
            entityType: 'InvoiceMCC',
            entityId: id,
            oldValues: mi,
            description: `Xóa MI: ${mi.name}`,
            ipAddress
        });
        return { message: 'Xóa MI thành công' };
    }

    async linkAccounts(id: string, accountIds: string[], userId: string, ipAddress?: string) {
        const mi = await this.invoiceMCCRepo.findById(id);
        if (!mi) throw new Error('NOT_FOUND: Invoice MCC không tồn tại');

        await accountRepository.updateMany(accountIds, { currentMiId: id });
        await this.invoiceMCCRepo.syncCounts(id);

        await logActivity({
            userId,
            action: 'LINK_MI',
            entityType: 'InvoiceMCC',
            entityId: id,
            newValues: { accountIds },
            description: `Liên kết ${accountIds.length} tài khoản với MI: ${mi.name}`,
            ipAddress
        });
        return { message: 'Liên kết tài khoản thành công' };
    }
}

export const invoiceMCCService = new InvoiceMCCService();
