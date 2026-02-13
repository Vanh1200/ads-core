import prisma from '../prisma';
import { ICustomerRepository } from '../../../domain/repositories/ICustomerRepository';
import { Customer } from '../../../domain/entities/Customer';
import { CustomerStatus, Prisma } from '@prisma/client';

export class PrismaCustomerRepository implements ICustomerRepository {
    async findById(id: string): Promise<Customer | null> {
        const customer = await prisma.customer.findUnique({
            where: { id },
            include: { assignedStaff: { select: { id: true, fullName: true } } },
        });
        return this.mapToEntity(customer);
    }

    async findByName(name: string): Promise<Customer | null> {
        const customer = await prisma.customer.findUnique({ where: { name } });
        return this.mapToEntity(customer);
    }

    async list(params: { page: number; limit: number; q?: string; status?: string }): Promise<{ data: Customer[]; total: number }> {
        const { page, limit, q, status } = params;
        const where: Prisma.CustomerWhereInput = {};
        if (status) where.status = status as CustomerStatus;
        if (q) {
            where.name = { contains: q, mode: 'insensitive' };
        }

        const [customers, total] = await Promise.all([
            prisma.customer.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: { assignedStaff: { select: { id: true, fullName: true } } },
            }),
            prisma.customer.count({ where }),
        ]);

        return {
            data: customers.map(c => this.mapToEntity(c)!),
            total,
        };
    }

    async create(data: Omit<Customer, 'id' | 'createdAt' | 'updatedAt' | 'totalSpending' | 'totalAccounts' | 'activeAccounts'>): Promise<Customer> {
        const customer = await prisma.customer.create({
            data: {
                name: data.name,
                contactInfo: data.contactInfo,
                status: data.status as CustomerStatus || 'ACTIVE',
                notes: data.notes,
                assignedStaff: data.assignedStaffId ? { connect: { id: data.assignedStaffId } } : undefined,
            },
        });
        return this.mapToEntity(customer)!;
    }

    async update(id: string, data: Partial<Customer>): Promise<Customer> {
        const updateData: Prisma.CustomerUpdateInput = {};
        if (data.name) updateData.name = data.name;
        if (data.contactInfo !== undefined) updateData.contactInfo = data.contactInfo;
        if (data.status) updateData.status = data.status as CustomerStatus;
        if (data.notes !== undefined) updateData.notes = data.notes;
        if (data.assignedStaffId !== undefined) {
            updateData.assignedStaff = data.assignedStaffId ? { connect: { id: data.assignedStaffId } } : { disconnect: true };
        }

        const customer = await prisma.customer.update({
            where: { id },
            data: updateData,
        });
        return this.mapToEntity(customer)!;
    }

    async delete(id: string): Promise<void> {
        await prisma.customer.delete({ where: { id } });
    }

    private mapToEntity(prismaCustomer: any): Customer | null {
        if (!prismaCustomer) return null;
        return {
            ...prismaCustomer,
            totalSpending: Number(prismaCustomer.totalSpending),
        } as Customer;
    }
}

export const customerRepository = new PrismaCustomerRepository();
