import { IAccountRepository } from '../../domain/repositories/IAccountRepository';
import { accountRepository } from '../../infrastructure/database/repositories/PrismaAccountRepository';
import { Account } from '../../domain/entities/Account';
import { logActivity } from '../../infrastructure/logging/ActivityLogger';
import prisma from '../../infrastructure/database/prisma';
import { invoiceMCCRepository } from '../../infrastructure/database/repositories/PrismaInvoiceMCCRepository';
import { customerRepository } from '../../infrastructure/database/repositories/PrismaCustomerRepository';

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
        // Find affected MI and MC IDs before status update to sync them after
        const accounts = await prisma.account.findMany({
            where: { id: { in: ids } },
            select: { currentMiId: true, currentMcId: true }
        });
        const miIds = [...new Set(accounts.map((a: { currentMiId: string | null }) => a.currentMiId).filter((id: string | null) => id !== null))] as string[];
        const mcIds = [...new Set(accounts.map((a: { currentMcId: string | null }) => a.currentMcId).filter((id: string | null) => id !== null))] as string[];

        const result = await this.accountRepo.updateMany(ids, { status });

        // Sync counts
        await Promise.all([
            ...miIds.map((id: string) => invoiceMCCRepository.syncCounts(id)),
            ...mcIds.map((id: string) => customerRepository.syncCounts(id))
        ]);

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
        const accounts = await prisma.account.findMany({
            where: { id: { in: ids } },
            select: { currentMiId: true }
        });
        const miIds = [...new Set(accounts.map((a: { currentMiId: string | null }) => a.currentMiId).filter((id: string | null) => id !== null))] as string[];

        const result = await this.accountRepo.updateMany(ids, { currentMiId: null });

        // Sync affected MIs
        await Promise.all(miIds.map((id: string) => invoiceMCCRepository.syncCounts(id)));

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
        const accounts = await prisma.account.findMany({
            where: { id: { in: ids } },
            select: { currentMcId: true }
        });
        const mcIds = [...new Set(accounts.map((a: { currentMcId: string | null }) => a.currentMcId).filter((id: string | null) => id !== null))] as string[];

        const result = await this.accountRepo.updateMany(ids, { currentMcId: null });

        // Sync affected MCs
        await Promise.all(mcIds.map((id: string) => customerRepository.syncCounts(id)));

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
