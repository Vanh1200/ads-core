"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../config/database"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const validators_1 = require("../utils/validators");
const activityLogger_1 = __importDefault(require("../utils/activityLogger"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const router = (0, express_1.Router)();
// GET /api/users/simple - List simple users for dropdowns
router.get('/simple', auth_middleware_1.authenticateToken, auth_middleware_1.canView, async (req, res) => {
    try {
        const users = await database_1.default.user.findMany({
            where: { isActive: true },
            select: { id: true, fullName: true, email: true },
            orderBy: { fullName: 'asc' },
        });
        res.json(users);
    }
    catch (error) {
        console.error('Get simple users error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/users - List all users (admin only)
router.get('/', auth_middleware_1.authenticateToken, auth_middleware_1.isAdmin, async (req, res) => {
    try {
        const query = validators_1.paginationSchema.safeParse(req.query);
        const { page, limit, search } = query.success ? query.data : { page: 1, limit: 20, search: undefined };
        const where = search ? {
            OR: [
                { email: { contains: search, mode: 'insensitive' } },
                { fullName: { contains: search, mode: 'insensitive' } },
            ],
        } : {};
        const [users, total] = await Promise.all([
            database_1.default.user.findMany({
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
            database_1.default.user.count({ where }),
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
    }
    catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/users/:id - Get user by ID
router.get('/:id', auth_middleware_1.authenticateToken, auth_middleware_1.isAdmin, async (req, res) => {
    try {
        const user = await database_1.default.user.findUnique({
            where: { id: req.params.id },
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
    }
    catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// PUT /api/users/:id - Update user
router.put('/:id', auth_middleware_1.authenticateToken, auth_middleware_1.isAdmin, async (req, res) => {
    try {
        const { fullName, role, isActive } = req.body;
        const existingUser = await database_1.default.user.findUnique({ where: { id: req.params.id } });
        if (!existingUser) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        const user = await database_1.default.user.update({
            where: { id: req.params.id },
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
        await (0, activityLogger_1.default)({
            userId: req.user.id,
            action: 'UPDATE',
            entityType: 'User',
            entityId: user.id,
            oldValues: { fullName: existingUser.fullName, role: existingUser.role, isActive: existingUser.isActive },
            newValues: { fullName: user.fullName, role: user.role, isActive: user.isActive },
            description: `Cập nhật người dùng ${user.email}`,
            ipAddress: req.ip,
        });
        res.json(user);
    }
    catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// DELETE /api/users/:id - Deactivate user (soft delete)
router.delete('/:id', auth_middleware_1.authenticateToken, auth_middleware_1.isAdmin, async (req, res) => {
    try {
        const existingUser = await database_1.default.user.findUnique({ where: { id: req.params.id } });
        if (!existingUser) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        // Prevent self-deletion
        if (existingUser.id === req.user.id) {
            res.status(400).json({ error: 'Cannot deactivate yourself' });
            return;
        }
        await database_1.default.user.update({
            where: { id: req.params.id },
            data: { isActive: false },
        });
        await (0, activityLogger_1.default)({
            userId: req.user.id,
            action: 'DELETE',
            entityType: 'User',
            entityId: existingUser.id,
            description: `Vô hiệu hóa người dùng ${existingUser.email}`,
            ipAddress: req.ip,
        });
        res.json({ message: 'User deactivated successfully' });
    }
    catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/users/:id/reset-password - Reset user password (admin only)
router.post('/:id/reset-password', auth_middleware_1.authenticateToken, auth_middleware_1.isAdmin, async (req, res) => {
    try {
        const { newPassword } = req.body;
        if (!newPassword || newPassword.length < 6) {
            res.status(400).json({ error: 'Password must be at least 6 characters' });
            return;
        }
        const existingUser = await database_1.default.user.findUnique({ where: { id: req.params.id } });
        if (!existingUser) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        const passwordHash = await bcryptjs_1.default.hash(newPassword, 10);
        await database_1.default.user.update({
            where: { id: req.params.id },
            data: { passwordHash },
        });
        await (0, activityLogger_1.default)({
            userId: req.user.id,
            action: 'UPDATE',
            entityType: 'User',
            entityId: existingUser.id,
            description: `Đặt lại mật khẩu cho người dùng ${existingUser.email}`,
            ipAddress: req.ip,
        });
        res.json({ message: 'Password reset successfully' });
    }
    catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
//# sourceMappingURL=user.routes.js.map