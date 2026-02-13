import prisma from '../prisma';
import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { User } from '../../../domain/entities/User';
import { UserRole } from '@prisma/client';

export class PrismaUserRepository implements IUserRepository {
    async findByEmail(email: string): Promise<User | null> {
        return prisma.user.findUnique({ where: { email } }) as Promise<User | null>;
    }

    async findById(id: string): Promise<User | null> {
        return prisma.user.findUnique({ where: { id } }) as Promise<User | null>;
    }

    async create(data: Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'isActive'>): Promise<User> {
        return prisma.user.create({
            data: {
                email: data.email,
                passwordHash: data.passwordHash,
                fullName: data.fullName,
                role: data.role as UserRole,
            },
        }) as Promise<User>;
    }

    async update(id: string, data: Partial<User>): Promise<User> {
        const updateData: any = { ...data };
        if (data.role) updateData.role = data.role as UserRole;

        return prisma.user.update({
            where: { id },
            data: updateData,
        }) as Promise<User>;
    }
}

export const userRepository = new PrismaUserRepository();
