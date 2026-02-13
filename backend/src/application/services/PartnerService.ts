import { IPartnerRepository } from '../../domain/repositories/IPartnerRepository';
import { partnerRepository } from '../../infrastructure/database/repositories/PrismaPartnerRepository';
import { logActivity } from '../../infrastructure/logging/ActivityLogger';

export class PartnerService {
    constructor(private readonly partnerRepo: IPartnerRepository = partnerRepository) { }

    async list(params: any) {
        return this.partnerRepo.list(params);
    }

    async getById(id: string) {
        const partner = await this.partnerRepo.findById(id);
        if (!partner) throw new Error('NOT_FOUND: Đối tác không tồn tại');
        return partner;
    }

    async create(data: any, userId: string, ipAddress?: string) {
        const partner = await this.partnerRepo.create(data);
        await logActivity({
            userId,
            action: 'CREATE',
            entityType: 'Partner',
            entityId: partner.id,
            newValues: partner,
            description: `Tạo đối tác: ${partner.name}`,
            ipAddress
        });
        return partner;
    }

    async update(id: string, data: any, userId: string, ipAddress?: string) {
        const oldPartner = await this.partnerRepo.findById(id);
        if (!oldPartner) throw new Error('NOT_FOUND: Đối tác không tồn tại');

        const partner = await this.partnerRepo.update(id, data);
        await logActivity({
            userId,
            action: 'UPDATE',
            entityType: 'Partner',
            entityId: id,
            oldValues: oldPartner,
            newValues: partner,
            description: `Cập nhật đối tác: ${partner.name}`,
            ipAddress
        });
        return partner;
    }

    async delete(id: string, userId: string, ipAddress?: string) {
        const partner = await this.partnerRepo.findById(id);
        if (!partner) throw new Error('NOT_FOUND: Đối tác không tồn tại');

        await this.partnerRepo.delete(id);
        await logActivity({
            userId,
            action: 'DELETE',
            entityType: 'Partner',
            entityId: id,
            oldValues: partner,
            description: `Xóa đối tác: ${partner.name}`,
            ipAddress
        });
        return { message: 'Xóa đối tác thành công' };
    }
}

export const partnerService = new PartnerService();
