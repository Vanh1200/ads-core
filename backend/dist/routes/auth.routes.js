"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_1 = __importDefault(require("../config/database"));
const validators_1 = require("../utils/validators");
const auth_middleware_1 = require("../middleware/auth.middleware");
const activityLogger_1 = __importDefault(require("../utils/activityLogger"));
const router = (0, express_1.Router)();
// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const validation = validators_1.loginSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({ error: validation.error.errors });
            return;
        }
        const { email, password } = validation.data;
        const user = await database_1.default.user.findUnique({ where: { email } });
        if (!user || !user.isActive) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }
        const isValidPassword = await bcryptjs_1.default.compare(password, user.passwordHash);
        if (!isValidPassword) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }
        const token = jsonwebtoken_1.default.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                role: user.role,
            },
        });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/auth/register (admin only)
router.post('/register', auth_middleware_1.authenticateToken, auth_middleware_1.isAdmin, async (req, res) => {
    try {
        const validation = validators_1.registerSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({ error: validation.error.errors });
            return;
        }
        const { email, password, fullName, role } = validation.data;
        const existingUser = await database_1.default.user.findUnique({ where: { email } });
        if (existingUser) {
            res.status(409).json({ error: 'Email already exists' });
            return;
        }
        const passwordHash = await bcryptjs_1.default.hash(password, 10);
        const user = await database_1.default.user.create({
            data: {
                email,
                passwordHash,
                fullName,
                role: role || 'VIEWER',
            },
        });
        await (0, activityLogger_1.default)({
            userId: req.user.id,
            action: 'CREATE',
            entityType: 'User',
            entityId: user.id,
            newValues: { email, fullName, role: user.role },
            description: `Tạo người dùng ${email}`,
            ipAddress: req.ip,
        });
        res.status(201).json({
            message: 'User created successfully',
            user: {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                role: user.role,
            },
        });
    }
    catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/auth/me
router.get('/me', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const user = await database_1.default.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                email: true,
                fullName: true,
                role: true,
                isActive: true,
                createdAt: true,
            },
        });
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json(user);
    }
    catch (error) {
        console.error('Get me error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/auth/change-password
router.post('/change-password', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword || newPassword.length < 6) {
            res.status(400).json({ error: 'Invalid password data' });
            return;
        }
        const user = await database_1.default.user.findUnique({ where: { id: req.user.id } });
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        const isValidPassword = await bcryptjs_1.default.compare(currentPassword, user.passwordHash);
        if (!isValidPassword) {
            res.status(401).json({ error: 'Current password is incorrect' });
            return;
        }
        const passwordHash = await bcryptjs_1.default.hash(newPassword, 10);
        await database_1.default.user.update({
            where: { id: user.id },
            data: { passwordHash },
        });
        res.json({ message: 'Password changed successfully' });
    }
    catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
//# sourceMappingURL=auth.routes.js.map