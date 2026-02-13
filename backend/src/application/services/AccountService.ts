import { IAccountRepository } from '../../domain/repositories/IAccountRepository';
import { accountRepository } from '../../infrastructure/database/repositories/PrismaAccountRepository';
import { Account } from '../../domain/entities/Account';
import { logActivity } from '../../infrastructure/logging/ActivityLogger';

export class AccountService {
    constructor(private readonly accountRepo: IAccountRepository = accountRepository) { }

    async list(params: any) {
        return this.accountRepo.list(params);
    }

    async getById(id: string) {
        const account = await this.accountRepo.findById(id);
        if (!account) throw new Error('NOT_FOUND: Account not found');
        return account;
    }

    async create(data: any, userId: string, ipAddress?: string) {
        const account = await this.accountRepo.create(data);
        await logActivity({
            userId,
            action: 'CREATE',
            entityType: 'Account',
            entityId: account.id,
            newValues: account,
            description: `Tạo tài khoản mới: ${account.accountName}`,
            ipAddress
        });
        return account;
    }

    async update(id: string, data: any, userId: string, ipAddress?: string) {
        const oldAccount = await this.accountRepo.findById(id);
        if (!oldAccount) throw new Error('NOT_FOUND: Account not found');

        const updatedAccount = await this.accountRepo.update(id, data);
        await logActivity({
            userId,
            action: 'UPDATE',
            entityType: 'Account',
            entityId: id,
            oldValues: oldAccount,
            newValues: updatedAccount,
            description: `Cập nhật tài khoản: ${updatedAccount.accountName}`,
            ipAddress
        });
        return updatedAccount;
    }

    async bulkUpdateStatus(ids: string[], status: any, userId: string, ipAddress?: string) {
        const result = await this.accountRepo.updateMany(ids, { status });
        await logActivity({
            userId,
            action: 'UPDATE',
            entityType: 'Account',
            entityId: 'BULK',
            newValues: { ids, status },
            description: `Cập nhật trạng thái cho ${ids.length} tài khoản thành ${status}`,
            ipAddress
        });
        return result;
    }

    async getUnlinked() {
        return this.accountRepo.findUnlinked();
    }

    async getUnassigned() {
        return this.accountRepo.findUnassigned();
    }

    async bulkUnlinkMi(ids: string[], userId: string, ipAddress?: string) {
        const result = await this.accountRepo.updateMany(ids, { currentMiId: null });
        await logActivity({
            userId,
            action: 'UNLINK_MI',
            entityType: 'Account',
            entityId: 'BULK',
            newValues: { ids },
            description: `Ngắt liên kết MI cho ${ids.length} tài khoản`,
            ipAddress
        });
        return result;
    }

    async bulkUnassignMc(ids: string[], userId: string, ipAddress?: string) {
        const result = await this.accountRepo.updateMany(ids, { currentMcId: null });
        await logActivity({
            userId,
            action: 'UNASSIGN_MC',
            entityType: 'Account',
            entityId: 'BULK',
            newValues: { ids },
            description: `Gỡ gán MC cho ${ids.length} tài khoản`,
            ipAddress
        });
        return result;
    }
}

export const accountService = new AccountService();
