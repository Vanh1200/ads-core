import { IBatchRepository } from '../../domain/repositories/IBatchRepository';
import { batchRepository } from '../../infrastructure/database/repositories/PrismaBatchRepository';
import { logActivity } from '../../infrastructure/logging/ActivityLogger';

export class BatchService {
    constructor(private readonly batchRepo: IBatchRepository = batchRepository) { }

    async list(params: any) {
        return this.batchRepo.list(params);
    }

    async getById(id: string) {
        const batch = await this.batchRepo.findById(id);
        if (!batch) throw new Error('NOT_FOUND: Lô không tồn tại');
        return batch;
    }

    async create(data: any, userId: string, ipAddress?: string) {
        const batch = await this.batchRepo.create(data);
        await logActivity({
            userId,
            action: 'CREATE',
            entityType: 'AccountBatch',
            entityId: batch.id,
            newValues: batch,
            description: `Tạo Lô tài khoản: ${batch.mccAccountName}`,
            ipAddress
        });
        return batch;
    }

    async update(id: string, data: any, userId: string, ipAddress?: string) {
        const oldBatch = await this.batchRepo.findById(id);
        if (!oldBatch) throw new Error('NOT_FOUND: Lô không tồn tại');

        const batch = await this.batchRepo.update(id, data);
        await logActivity({
            userId,
            action: 'UPDATE',
            entityType: 'AccountBatch',
            entityId: id,
            oldValues: oldBatch,
            newValues: batch,
            description: `Cập nhật Lô tài khoản: ${batch.mccAccountName}`,
            ipAddress
        });
        return batch;
    }

    async delete(id: string, userId: string, ipAddress?: string) {
        const batch = await this.batchRepo.findById(id);
        if (!batch) throw new Error('NOT_FOUND: Lô không tồn tại');

        await this.batchRepo.delete(id);
        await logActivity({
            userId,
            action: 'DELETE',
            entityType: 'AccountBatch',
            entityId: id,
            oldValues: batch,
            description: `Xóa Lô tài khoản: ${batch.mccAccountName}`,
            ipAddress
        });
        return { message: 'Xóa Lô thành công' };
    }

    async bulkUpdate(ids: string[], data: any, userId: string, ipAddress?: string) {
        const result = await this.batchRepo.updateMany(ids, data);
        await logActivity({
            userId,
            action: 'UPDATE',
            entityType: 'AccountBatch',
            entityId: 'BULK',
            newValues: { ids, data },
            description: `Cập nhật hàng loạt ${ids.length} Lô`,
            ipAddress
        });
        return result;
    }

    async getAccountsByBatchId(batchId: string, params: any) {
        // This might need a delegated call to AccountRepository or a specific method in BatchRepository
        // Current implementation in GetBatchAccountsUseCase used accountRepository.list
        // To be consistent, let's keep logic simple
        return this.batchRepo.findAccountsByBatchId(batchId, params);
    }
}

export const batchService = new BatchService();
