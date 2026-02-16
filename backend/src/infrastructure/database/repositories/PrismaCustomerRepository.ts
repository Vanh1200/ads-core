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

    async list(params: {
        page: number;
        limit: number;
        q?: string;
        status?: string;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
        startDate?: Date;
        endDate?: Date;
    }): Promise<{ data: Customer[]; total: number }> {
        const { page, limit, q, status, sortBy, sortOrder, startDate, endDate } = params;
        const where: Prisma.CustomerWhereInput = {};
        if (status) where.status = status as CustomerStatus;
        if (q) {
            where.name = { contains: q, mode: 'insensitive' };
        }

        const include = {
            assignedStaff: { select: { id: true, fullName: true } },
            accounts: {
                include: {
                    spendingRecords: startDate && endDate ? {
                        where: {
                            spendingDate: {
                                gte: startDate,
                                lte: endDate
                            }
                        },
                        select: { amount: true }
                    } : undefined,
                }
            }
        };

        // Handle dynamic sorting
        // If sorting by rangeSpending, we must fetch all and sort in memory
        if (sortBy === 'rangeSpending') {
            const customers = await prisma.customer.findMany({
                where,
                include,
            });

            const mappedCustomers = customers.map(c => this.mapToEntity(c)!);

            mappedCustomers.sort((a, b) => {
                const spendA = a.rangeSpending || 0;
                const spendB = b.rangeSpending || 0;
                return sortOrder === 'asc' ? spendA - spendB : spendB - spendA;
            });

            const startIndex = (page - 1) * limit;
            const paginatedCustomers = mappedCustomers.slice(startIndex, startIndex + limit);

            return {
                data: paginatedCustomers,
                total: customers.length,
            };
        }

        const orderBy: any = {};
        if (sortBy) {
            orderBy[sortBy] = sortOrder || 'desc';
        } else {
            orderBy.createdAt = 'desc';
        }

        const [customers, total] = await Promise.all([
            prisma.customer.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy,
                include,
            }),
            prisma.customer.count({ where }),
        ]);

        return {
            data: customers.map((c: any) => this.mapToEntity(c)!),
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

    async syncCounts(id: string): Promise<void> {
        const [total, active] = await Promise.all([
            prisma.account.count({ where: { currentMcId: id } }),
            prisma.account.count({ where: { currentMcId: id, status: 'ACTIVE' } }),
        ]);

        await prisma.customer.update({
            where: { id },
            data: {
                totalAccounts: total,
                activeAccounts: active,
            },
        });
    }

    private mapToEntity(prismaCustomer: any): Customer | null {
        if (!prismaCustomer) return null;

        let rangeSpending = 0;
        if (prismaCustomer.accounts && Array.isArray(prismaCustomer.accounts)) {
            for (const account of prismaCustomer.accounts) {
                if (account.spendingRecords && Array.isArray(account.spendingRecords)) {
                    rangeSpending += account.spendingRecords.reduce((sum: number, r: any) => sum + Number(r.amount), 0);
                }
            }
        }

        return {
            ...prismaCustomer,
            totalSpending: Number(prismaCustomer.totalSpending),
            rangeSpending,
        } as Customer;
    }
}

export const customerRepository = new PrismaCustomerRepository();
