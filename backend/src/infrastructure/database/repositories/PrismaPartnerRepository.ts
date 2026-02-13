import prisma from '../prisma';
import { IPartnerRepository } from '../../../domain/repositories/IPartnerRepository';
import { Partner } from '../../../domain/entities/Partner';
import { PartnerType } from '@prisma/client';

export class PrismaPartnerRepository implements IPartnerRepository {
    async findById(id: string): Promise<Partner | null> {
        return prisma.partner.findUnique({ where: { id } }) as Promise<Partner | null>;
    }

    async list(params: { page: number; limit: number; q?: string }): Promise<{ data: Partner[]; total: number }> {
        const { page, limit, q } = params;
        const where: any = {};
        if (q) {
            where.name = { contains: q, mode: 'insensitive' };
        }

        const [partners, total] = await Promise.all([
            prisma.partner.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            prisma.partner.count({ where }),
        ]);

        return {
            data: partners as Partner[],
            total,
        };
    }

    async create(data: Omit<Partner, 'id' | 'createdAt'>): Promise<Partner> {
        return prisma.partner.create({
            data: {
                name: data.name,
                type: data.type as PartnerType,
                contactInfo: data.contactInfo,
                notes: data.notes,
            },
        }) as Promise<Partner>;
    }

    async update(id: string, data: Partial<Partner>): Promise<Partner> {
        const updateData: any = { ...data };
        if (data.type) updateData.type = data.type as PartnerType;

        return prisma.partner.update({
            where: { id },
            data: updateData,
        }) as Promise<Partner>;
    }

    async delete(id: string): Promise<void> {
        await prisma.partner.delete({ where: { id } });
    }
}

export const partnerRepository = new PrismaPartnerRepository();
