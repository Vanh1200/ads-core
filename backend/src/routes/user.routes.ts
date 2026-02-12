import { Router, Response } from 'express';
import prisma from '../config/database';
import { authenticateToken, AuthRequest, isAdmin, canView } from '../middleware/auth.middleware';
import { registerSchema, paginationSchema } from '../utils/validators';
import logActivity from '../utils/activityLogger';
import bcrypt from 'bcryptjs';

const router = Router();

// GET /api/users/simple - List simple users for dropdowns
router.get('/simple', authenticateToken, canView, async (req: AuthRequest, res: Response) => {
    try {
        const users = await prisma.user.findMany({
            where: { isActive: true },
            select: { id: true, fullName: true, email: true },
            orderBy: { fullName: 'asc' },
        });
        res.json(users);
    } catch (error) {
        console.error('Get simple users error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/users - List all users (admin only)
router.get('/', authenticateToken, isAdmin, async (req: AuthRequest, res: Response) => {
    try {
        const query = paginationSchema.safeParse(req.query);
        const { page, limit, search } = query.success ? query.data : { page: 1, limit: 20, search: undefined };

        const where = search ? {
            OR: [
                { email: { contains: search, mode: 'insensitive' as const } },
                { fullName: { contains: search, mode: 'insensitive' as const } },
            ],
        } : {};

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                select: {
                    id: true,
                    email: true,
                    fullName: true,
                    role: true,
                    isActive: true,
                    createdAt: true,
                },
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            prisma.user.count({ where }),
        ]);

        res.json({
            data: users,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/users/:id - Get user by ID
router.get('/:id', authenticateToken, isAdmin, async (req: AuthRequest, res: Response) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.params.id as string },
            select: {
                id: true,
                email: true,
                fullName: true,
                role: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        res.json(user);
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /api/users/:id - Update user
router.put('/:id', authenticateToken, isAdmin, async (req: AuthRequest, res: Response) => {
    try {
        const { fullName, role, isActive } = req.body;

        const existingUser = await prisma.user.findUnique({ where: { id: req.params.id as string } });
        if (!existingUser) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const user = await prisma.user.update({
            where: { id: req.params.id as string },
            data: {
                ...(fullName && { fullName }),
                ...(role && { role }),
                ...(typeof isActive === 'boolean' && { isActive }),
            },
            select: {
                id: true,
                email: true,
                fullName: true,
                role: true,
                isActive: true,
            },
        });

        await logActivity({
            userId: req.user!.id,
            action: 'UPDATE',
            entityType: 'User',
            entityId: user.id,
            oldValues: { fullName: existingUser.fullName, role: existingUser.role, isActive: existingUser.isActive },
            newValues: { fullName: user.fullName, role: user.role, isActive: user.isActive },
            description: `Cập nhật người dùng ${user.email}`,
            ipAddress: req.ip,
        });

        res.json(user);
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE /api/users/:id - Deactivate user (soft delete)
router.delete('/:id', authenticateToken, isAdmin, async (req: AuthRequest, res: Response) => {
    try {
        const existingUser = await prisma.user.findUnique({ where: { id: req.params.id as string } });
        if (!existingUser) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        // Prevent self-deletion
        if (existingUser.id === req.user!.id) {
            res.status(400).json({ error: 'Cannot deactivate yourself' });
            return;
        }

        await prisma.user.update({
            where: { id: req.params.id as string },
            data: { isActive: false },
        });

        await logActivity({
            userId: req.user!.id,
            action: 'DELETE',
            entityType: 'User',
            entityId: existingUser.id,
            description: `Vô hiệu hóa người dùng ${existingUser.email}`,
            ipAddress: req.ip,
        });

        res.json({ message: 'User deactivated successfully' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/users/:id/reset-password - Reset user password (admin only)
router.post('/:id/reset-password', authenticateToken, isAdmin, async (req: AuthRequest, res: Response) => {
    try {
        const { newPassword } = req.body;
        if (!newPassword || newPassword.length < 6) {
            res.status(400).json({ error: 'Password must be at least 6 characters' });
            return;
        }

        const existingUser = await prisma.user.findUnique({ where: { id: req.params.id as string } });
        if (!existingUser) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const passwordHash = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: req.params.id as string },
            data: { passwordHash },
        });

        await logActivity({
            userId: req.user!.id,
            action: 'UPDATE',
            entityType: 'User',
            entityId: existingUser.id,
            description: `Đặt lại mật khẩu cho người dùng ${existingUser.email}`,
            ipAddress: req.ip,
        });

        res.json({ message: 'Password reset successfully' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
