import { Router, Response } from 'express';
import prisma from '../config/database';
import { authenticateToken, AuthRequest, isAssigner, canView } from '../middleware/auth.middleware';
import { createCustomerSchema, paginationSchema } from '../utils/validators';
import logActivity from '../utils/activityLogger';

const router = Router();

// GET /api/customers - List all customers (MC)
router.get('/', authenticateToken, canView, async (req: AuthRequest, res: Response) => {
    try {
        const validation = paginationSchema.safeParse(req.query);
        const { page, limit } = validation.success ? validation.data : { page: 1, limit: 20 };
        const { search, spendingDays } = req.query;
        const days = spendingDays ? parseInt(spendingDays as string) : 7;
        const startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        startDate.setDate(startDate.getDate() - (days - 1));

        const where = search ? {
            name: { contains: search as string, mode: 'insensitive' as const },
        } : {};

        const [customers, total] = await Promise.all([
            prisma.customer.findMany({
                where,
                include: {
                    assignedStaff: { select: { id: true, fullName: true } },
                    _count: { select: { accounts: true } },
                },
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            prisma.customer.count({ where }),
        ]);

        // Optimized Aggregation: Fetch spending sums using groupBy
        const customerIds = customers.map(c => c.id);
        let rangeSpendingMap: Record<string, number> = {};

        if (customerIds.length > 0) {
            const spendingAggs = await prisma.spendingRecord.groupBy({
                by: ['customerId'],
                where: {
                    customerId: { in: customerIds },
                    spendingDate: { gte: startDate }
                },
                _sum: {
                    amount: true
                }
            });

            spendingAggs.forEach(agg => {
                if (agg.customerId) {
                    rangeSpendingMap[agg.customerId] = Number(agg._sum.amount || 0);
                }
            });
        }

        const data = customers.map(customer => ({
            ...customer,
            rangeSpending: rangeSpendingMap[customer.id] || 0
        }));

        res.json({
            data,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error('Get customers error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/customers - Create customer (MC)
router.post('/', authenticateToken, isAssigner, async (req: AuthRequest, res: Response) => {
    try {
        const validation = createCustomerSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({ error: validation.error.errors });
            return;
        }

        // Check if customer name already exists
        const existing = await prisma.customer.findUnique({
            where: { name: validation.data.name },
        });
        if (existing) {
            res.status(409).json({ error: 'Customer name already exists' });
            return;
        }

        const customer = await prisma.customer.create({ data: validation.data });

        await logActivity({
            userId: req.user!.id,
            action: 'CREATE',
            entityType: 'Customer',
            entityId: customer.id,
            newValues: validation.data,
            description: `Tạo Khách hàng ${customer.name}`,
            ipAddress: req.ip,
        });

        res.status(201).json(customer);
    } catch (error) {
        console.error('Create customer error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/customers/:id
router.get('/:id', authenticateToken, canView, async (req: AuthRequest, res: Response) => {
    try {
        const customer = await prisma.customer.findUnique({
            where: { id: req.params.id as string },
            include: {
                assignedStaff: { select: { id: true, fullName: true, email: true } },
                accounts: {
                    select: {
                        id: true,
                        googleAccountId: true,
                        accountName: true,
                        status: true,
                        currency: true,
                        totalSpending: true,
                        currentMi: { select: { id: true, name: true } },
                    },
                },
            },
        });

        if (!customer) {
            res.status(404).json({ error: 'Customer not found' });
            return;
        }

        res.json(customer);
    } catch (error) {
        console.error('Get customer error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /api/customers/:id
router.put('/:id', authenticateToken, isAssigner, async (req: AuthRequest, res: Response) => {
    try {
        const existing = await prisma.customer.findUnique({ where: { id: req.params.id as string } });
        if (!existing) {
            res.status(404).json({ error: 'Customer not found' });
            return;
        }

        const { name, contactInfo, status, assignedStaffId, notes } = req.body;
        const customer = await prisma.customer.update({
            where: { id: req.params.id as string },
            data: { name, contactInfo, status, assignedStaffId, notes },
        });

        await logActivity({
            userId: req.user!.id,
            action: 'UPDATE',
            entityType: 'Customer',
            entityId: customer.id,
            oldValues: existing,
            newValues: customer,
            description: `Cập nhật Khách hàng ${customer.name}`,
            ipAddress: req.ip,
        });

        res.json(customer);
    } catch (error) {
        console.error('Update customer error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE /api/customers/:id
router.delete('/:id', authenticateToken, isAssigner, async (req: AuthRequest, res: Response) => {
    try {
        const existing = await prisma.customer.findUnique({
            where: { id: req.params.id as string },
            include: {
                _count: {
                    select: { accounts: true },
                },
            },
        });

        if (!existing) {
            res.status(404).json({ error: 'Customer not found' });
            return;
        }

        if (existing._count.accounts > 0) {
            res.status(400).json({
                error: 'Cannot delete Customer with linked accounts',
            });
            return;
        }

        await prisma.customer.delete({ where: { id: req.params.id as string } });

        await logActivity({
            userId: req.user!.id,
            action: 'DELETE',
            entityType: 'Customer',
            entityId: existing.id,
            description: `Xóa Khách hàng ${existing.name}`,
            ipAddress: req.ip,
        });

        res.json({ message: 'Customer deleted successfully' });
    } catch (error) {
        console.error('Delete customer error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/customers/:id/assign-accounts - Assign accounts to customer
router.post('/:id/assign-accounts', authenticateToken, isAssigner, async (req: AuthRequest, res: Response) => {
    try {
        const customer = await prisma.customer.findUnique({ where: { id: req.params.id as string } });
        if (!customer) {
            res.status(404).json({ error: 'Customer not found' });
            return;
        }

        const { accountIds } = req.body;
        if (!Array.isArray(accountIds) || accountIds.length === 0) {
            res.status(400).json({ error: 'Account IDs required' });
            return;
        }

        const now = new Date();
        const results = [];

        for (const accountId of accountIds) {
            const account = await prisma.account.findUnique({
                where: { id: accountId },
                include: { currentMc: true }
            });
            if (!account) continue;

            // If already assigned to another customer, create unassign history
            let oldCustomerName = '';
            let oldValues = undefined;

            if (account.currentMcId && account.currentMcId !== customer.id) {
                oldCustomerName = account.currentMc?.name || '';
                oldValues = {
                    customerId: account.currentMcId,
                    customerName: oldCustomerName
                };

                await prisma.accountMCHistory.updateMany({
                    where: {
                        accountId: accountId,
                        customerId: account.currentMcId,
                        unassignedAt: null,
                    },
                    data: {
                        unassignedAt: now,
                        unassignedById: req.user!.id,
                        reason: 'REASSIGN',
                    },
                });
            }

            // Create new MC history
            await prisma.accountMCHistory.create({
                data: {
                    accountId,
                    customerId: customer.id,
                    assignedAt: now,
                    assignedById: req.user!.id,
                    reason: account.currentMcId ? 'REASSIGN' : 'INITIAL',
                },
            });

            // Update account current MC
            await prisma.account.update({
                where: { id: accountId },
                data: { currentMcId: customer.id },
            });

            results.push(accountId);

            const description = oldCustomerName
                ? `Thay đổi MC cho tài khoản ${account.googleAccountId} từ ${oldCustomerName} sang ${customer.name}`
                : `Gán tài khoản ${account.googleAccountId} cho khách hàng ${customer.name}`;

            await logActivity({
                userId: req.user!.id,
                action: 'ASSIGN_MC',
                entityType: 'Account',
                entityId: accountId,
                oldValues,
                newValues: {
                    customerId: customer.id,
                    customerName: customer.name
                },
                description,
                ipAddress: req.ip,
            });
        }

        // Update customer counts
        await prisma.customer.update({
            where: { id: customer.id },
            data: {
                totalAccounts: { increment: results.length },
                activeAccounts: { increment: results.length },
            },
        });

        res.json({ message: `Assigned ${results.length} accounts`, assignedAccountIds: results });
    } catch (error) {
        console.error('Assign accounts error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
