import prisma from '../prisma';
import { IInvoiceMCCRepository } from '../../../domain/repositories/IInvoiceMCCRepository';
import { InvoiceMCC } from '../../../domain/entities/InvoiceMCC';
import { InvoiceMCCStatus, CreditStatus, Prisma } from '@prisma/client';

export class PrismaInvoiceMCCRepository implements IInvoiceMCCRepository {
    async findById(id: string): Promise<InvoiceMCC | null> {
        const mcc = await prisma.invoiceMCC.findUnique({
            where: { id },
            include: { partner: { select: { id: true, name: true } } },
        });
        return this.mapToEntity(mcc);
    }

    async findByMccId(mccInvoiceId: string): Promise<InvoiceMCC | null> {
        const mcc = await prisma.invoiceMCC.findUnique({ where: { mccInvoiceId } });
        return this.mapToEntity(mcc);
    }

    async list(params: {
        page: number;
        limit: number;
        q?: string;
        status?: string;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
    }): Promise<{ data: InvoiceMCC[]; total: number }> {
        const { page, limit, q, status, sortBy, sortOrder } = params;
        const where: Prisma.InvoiceMCCWhereInput = {};
        if (status) where.status = status as InvoiceMCCStatus;
        if (q) {
            where.OR = [
                { name: { contains: q, mode: 'insensitive' } },
                { mccInvoiceId: { contains: q, mode: 'insensitive' } },
            ];
        }

        // Handle dynamic sorting
        const orderBy: any = {};
        if (sortBy) {
            orderBy[sortBy] = sortOrder || 'desc';
        } else {
            orderBy.createdAt = 'desc';
        }

        const [mccs, total] = await Promise.all([
            prisma.invoiceMCC.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy,
                include: { partner: { select: { id: true, name: true } } },
            }),
            prisma.invoiceMCC.count({ where }),
        ]);

        return {
            data: mccs.map((m: any) => this.mapToEntity(m)!),
            total,
        };
    }

    async create(data: Omit<InvoiceMCC, 'id' | 'createdAt' | 'updatedAt' | 'linkedAccountsCount' | 'activeAccountsCount'>): Promise<InvoiceMCC> {
        const mcc = await prisma.invoiceMCC.create({
            data: {
                name: data.name,
                mccInvoiceId: data.mccInvoiceId,
                status: data.status as InvoiceMCCStatus || 'PENDING',
                creditStatus: data.creditStatus as CreditStatus || 'PENDING',
                notes: data.notes,
                partner: data.partnerId ? { connect: { id: data.partnerId } } : undefined,
                createdBy: { connect: { id: data.createdById } },
            },
        });
        return this.mapToEntity(mcc)!;
    }

    async update(id: string, data: Partial<InvoiceMCC>): Promise<InvoiceMCC> {
        const updateData: Prisma.InvoiceMCCUpdateInput = {};
        if (data.name) updateData.name = data.name;
        if (data.status) updateData.status = data.status as InvoiceMCCStatus;
        if (data.creditStatus) updateData.creditStatus = data.creditStatus as CreditStatus;
        if (data.notes !== undefined) updateData.notes = data.notes;
        if (data.partnerId !== undefined) {
            updateData.partner = data.partnerId ? { connect: { id: data.partnerId } } : { disconnect: true };
        }

        const mcc = await prisma.invoiceMCC.update({
            where: { id },
            data: updateData,
        });
        return this.mapToEntity(mcc)!;
    }

    async delete(id: string): Promise<void> {
        await prisma.invoiceMCC.delete({ where: { id } });
    }

    private mapToEntity(prismaMcc: any): InvoiceMCC | null {
        if (!prismaMcc) return null;
        return prismaMcc as InvoiceMCC;
    }
}

export const invoiceMCCRepository = new PrismaInvoiceMCCRepository();
