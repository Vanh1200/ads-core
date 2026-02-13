import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { userRepository } from '../../infrastructure/database/repositories/PrismaUserRepository';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
import logger from '../../infrastructure/logging/Logger';
import { logActivity } from '../../infrastructure/logging/ActivityLogger';

export class AuthService {
    constructor(private readonly userRepo: IUserRepository = userRepository) { }

    async login(data: any) {
        const user = await this.userRepo.findByEmail(data.email);
        if (!user || !user.isActive) {
            throw new Error('BAD_REQUEST: Invalid credentials');
        }

        const isValid = await bcrypt.compare(data.password, user.passwordHash);
        if (!isValid) {
            throw new Error('BAD_REQUEST: Invalid credentials');
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET || 'secret',
            { expiresIn: '7d' }
        );

        logger.info(`User logged in: ${user.email}`, { userId: user.id });

        return {
            token,
            user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
        };
    }

    async register(data: any, creatorId: string, ipAddress?: string) {
        const passwordHash = await bcrypt.hash(data.password, 10);
        const user = await this.userRepo.create({
            ...data,
            passwordHash,
        });

        await logActivity({
            userId: creatorId,
            action: 'CREATE',
            entityType: 'User',
            entityId: user.id,
            description: `Tạo người dùng mới: ${user.email}`,
            ipAddress
        });

        const { passwordHash: _, ...userWithoutPassword } = user as any;
        return userWithoutPassword;
    }

    async getMe(userId: string) {
        const user = await this.userRepo.findById(userId);
        if (!user) throw new Error('NOT_FOUND: User not found');

        const { passwordHash: _, ...userWithoutPassword } = user as any;
        return userWithoutPassword;
    }

    async changePassword(userId: string, currentPassword: string, newPassword: string) {
        const user = await this.userRepo.findById(userId);
        if (!user) throw new Error('NOT_FOUND: User not found');

        const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isValid) throw new Error('BAD_REQUEST: Current password incorrect');

        const newPasswordHash = await bcrypt.hash(newPassword, 10);
        await this.userRepo.update(userId, { passwordHash: newPasswordHash });

        return { message: 'Password changed successfully' };
    }
}

export const authService = new AuthService();
