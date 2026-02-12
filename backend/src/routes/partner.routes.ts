import { Router, Response } from 'express';
import prisma from '../config/database';
import { authenticateToken, AuthRequest, isBuyer, canView } from '../middleware/auth.middleware';
import { createPartnerSchema, paginationSchema } from '../utils/validators';
import logActivity from '../utils/activityLogger';

const router = Router();

// GET /api/partners - List all partners
router.get('/', authenticateToken, canView, async (req: AuthRequest, res: Response) => {
    try {
        const query = paginationSchema.safeParse(req.query);
        const { page, limit, search } = query.success ? query.data : { page: 1, limit: 20, search: undefined };

        const where = search ? {
            name: { contains: search, mode: 'insensitive' as const },
        } : {};

        const [partners, total] = await Promise.all([
            prisma.partner.findMany({
                where,
                include: {
                    _count: {
                        select: { batches: true, invoiceMCCs: true },
                    },
                },
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            prisma.partner.count({ where }),
        ]);

        res.json({
            data: partners,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error('Get partners error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/partners - Create partner
router.post('/', authenticateToken, isBuyer, async (req: AuthRequest, res: Response) => {
    try {
        const validation = createPartnerSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({ error: validation.error.errors });
            return;
        }

        const partner = await prisma.partner.create({ data: validation.data });

        await logActivity({
            userId: req.user!.id,
            action: 'CREATE',
            entityType: 'Partner',
            entityId: partner.id,
            newValues: validation.data,
            description: `Tạo Đối tác ${partner.name}`,
            ipAddress: req.ip,
        });

        res.status(201).json(partner);
    } catch (error) {
        console.error('Create partner error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/partners/:id
router.get('/:id', authenticateToken, canView, async (req: AuthRequest, res: Response) => {
    try {
        const partner = await prisma.partner.findUnique({
            where: { id: req.params.id as string },
            include: {
                batches: { select: { id: true, mccAccountName: true, status: true } },
                invoiceMCCs: { select: { id: true, name: true, mccInvoiceId: true, status: true } },
            },
        });

        if (!partner) {
            res.status(404).json({ error: 'Partner not found' });
            return;
        }

        res.json(partner);
    } catch (error) {
        console.error('Get partner error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /api/partners/:id
router.put('/:id', authenticateToken, isBuyer, async (req: AuthRequest, res: Response) => {
    try {
        const existing = await prisma.partner.findUnique({ where: { id: req.params.id as string } });
        if (!existing) {
            res.status(404).json({ error: 'Partner not found' });
            return;
        }

        const { name, contactInfo, type, notes } = req.body;
        const partner = await prisma.partner.update({
            where: { id: req.params.id as string },
            data: { name, contactInfo, type, notes },
        });

        await logActivity({
            userId: req.user!.id,
            action: 'UPDATE',
            entityType: 'Partner',
            entityId: partner.id,
            oldValues: existing,
            newValues: partner,
            description: `Cập nhật Đối tác ${partner.name}`,
            ipAddress: req.ip,
        });

        res.json(partner);
    } catch (error) {
        console.error('Update partner error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE /api/partners/:id
router.delete('/:id', authenticateToken, isBuyer, async (req: AuthRequest, res: Response) => {
    try {
        const existing = await prisma.partner.findUnique({
            where: { id: req.params.id as string },
            include: {
                _count: {
                    select: { batches: true, invoiceMCCs: true },
                },
            },
        });

        if (!existing) {
            res.status(404).json({ error: 'Partner not found' });
            return;
        }

        if (existing._count.batches > 0 || existing._count.invoiceMCCs > 0) {
            res.status(400).json({
                error: 'Cannot delete partner with linked Batches or Invoice MCCs',
            });
            return;
        }

        await prisma.partner.delete({ where: { id: req.params.id as string } });

        await logActivity({
            userId: req.user!.id,
            action: 'DELETE',
            entityType: 'Partner',
            entityId: existing.id,
            description: `Xóa Đối tác ${existing.name}`,
            ipAddress: req.ip,
        });

        res.json({ message: 'Partner deleted successfully' });
    } catch (error) {
        console.error('Delete partner error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
