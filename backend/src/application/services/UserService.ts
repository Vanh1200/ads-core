import prisma from '../../infrastructure/database/prisma';
import { logActivity } from '../../infrastructure/logging/ActivityLogger';
import bcrypt from 'bcryptjs';

export class UserService {
    async listSimple() {
        return prisma.user.findMany({
            where: { isActive: true },
            select: { id: true, fullName: true, email: true },
            orderBy: { fullName: 'asc' },
        });
    }

    async list(params: { page: number; limit: number; search?: string }) {
        const { page, limit, search } = params;
        const where = search ? {
            OR: [
                { email: { contains: search, mode: 'insensitive' as const } },
                { fullName: { contains: search, mode: 'insensitive' as const } },
            ],
        } : {};

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                select: { id: true, email: true, fullName: true, role: true, isActive: true, createdAt: true },
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            prisma.user.count({ where }),
        ]);

        return { data: users, total };
    }

    async getById(id: string) {
        const user = await prisma.user.findUnique({
            where: { id },
            select: { id: true, email: true, fullName: true, role: true, isActive: true, createdAt: true, updatedAt: true },
        });
        if (!user) throw new Error('NOT_FOUND: User not found');
        return user;
    }

    async update(id: string, data: any, adminId: string, ipAddress?: string) {
        const existing = await prisma.user.findUnique({ where: { id } });
        if (!existing) throw new Error('NOT_FOUND: User not found');

        const { fullName, role, isActive } = data;
        const user = await prisma.user.update({
            where: { id },
            data: { ...(fullName && { fullName }), ...(role && { role }), ...(typeof isActive === 'boolean' && { isActive }) },
            select: { id: true, email: true, fullName: true, role: true, isActive: true },
        });

        await logActivity({ userId: adminId, action: 'UPDATE', entityType: 'User', entityId: user.id, oldValues: { fullName: existing.fullName, role: existing.role, isActive: existing.isActive }, newValues: { fullName: user.fullName, role: user.role, isActive: user.isActive }, description: `Cập nhật người dùng ${user.email}`, ipAddress });
        return user;
    }

    async deactivate(id: string, adminId: string, ipAddress?: string) {
        const existing = await prisma.user.findUnique({ where: { id } });
        if (!existing) throw new Error('NOT_FOUND: User not found');
        if (existing.id === adminId) throw new Error('BAD_REQUEST: Cannot deactivate yourself');

        await prisma.user.update({ where: { id }, data: { isActive: false } });
        await logActivity({ userId: adminId, action: 'DELETE', entityType: 'User', entityId: existing.id, description: `Vô hiệu hóa người dùng ${existing.email}`, ipAddress });
        return { message: 'User deactivated successfully' };
    }

    async resetPassword(id: string, newPassword: string, adminId: string, ipAddress?: string) {
        if (!newPassword || newPassword.length < 6) throw new Error('BAD_REQUEST: Password must be at least 6 characters');

        const existing = await prisma.user.findUnique({ where: { id } });
        if (!existing) throw new Error('NOT_FOUND: User not found');

        const passwordHash = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({ where: { id }, data: { passwordHash } });
        await logActivity({ userId: adminId, action: 'UPDATE', entityType: 'User', entityId: existing.id, description: `Đặt lại mật khẩu cho người dùng ${existing.email}`, ipAddress });
        return { message: 'Password reset successfully' };
    }
}

export const userService = new UserService();
