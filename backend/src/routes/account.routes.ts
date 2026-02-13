import { Router, Response } from 'express';
import prisma from '../config/database';
import { authenticateToken, AuthRequest, canView, isBuyer, isLinker, isAssigner } from '../middleware/auth.middleware';
import { createAccountSchema, paginationSchema } from '../utils/validators';
import logActivity from '../utils/activityLogger';

const router = Router();

// GET /api/accounts - List all accounts
router.get('/', authenticateToken, canView, async (req: AuthRequest, res: Response) => {
    try {
        const query = paginationSchema.safeParse(req.query);
        const { page, limit, search } = query.success ? query.data : { page: 1, limit: 20, search: undefined };

        const { status, batchId, miId, mcId, sortBy, sortOrder, ids, spendingDays } = req.query;

        const conditions: any[] = [];

        // Calculate spending date range
        let spendingStart = new Date();
        spendingStart.setHours(0, 0, 0, 0);
        if (spendingDays) {
            const days = parseInt(spendingDays as string);
            if (!isNaN(days) && days > 1) {
                spendingStart.setDate(spendingStart.getDate() - (days - 1));
            }
        }

        if (search) {
            conditions.push({
                OR: [
                    { googleAccountId: { contains: search as string, mode: 'insensitive' } },
                    { accountName: { contains: search as string, mode: 'insensitive' } },
                ]
            });
        }

        if (status) conditions.push({ status: status as string });
        if (batchId) conditions.push({ batchId: batchId as string });
        if (miId) conditions.push({ currentMiId: miId as string });
        if (mcId) conditions.push({ currentMcId: mcId as string });

        if (ids) {
            const idList = Array.isArray(ids) ? ids : (ids as string).split(',').map(s => s.trim()).filter(Boolean);
            if (idList.length > 0) {
                conditions.push({
                    OR: [
                        { googleAccountId: { in: idList as string[] } },
                        { id: { in: idList as string[] } }
                    ]
                });
            }
        }

        const where = conditions.length > 0 ? { AND: conditions } : {};

        // Build orderBy based on sortBy and sortOrder
        const validSortFields = ['googleAccountId', 'accountName', 'status', 'currency', 'totalSpending', 'createdAt'];
        const order = sortOrder === 'asc' ? 'asc' : 'desc';
        let orderBy: any = {};

        if (sortBy === 'batch') {
            orderBy = { batch: { mccAccountName: order } };
        } else if (sortBy === 'currentMi') {
            orderBy = { currentMi: { name: order } };
        } else if (sortBy === 'currentMc') {
            orderBy = { currentMc: { name: order } };
        } else {
            const field = validSortFields.includes(sortBy as string) ? sortBy as string : 'createdAt';
            orderBy = { [field]: order };
        }

        const [accounts, total] = await Promise.all([
            prisma.account.findMany({
                where,
                include: {
                    batch: { select: { id: true, mccAccountName: true, mccAccountId: true } },
                    currentMi: { select: { id: true, name: true, mccInvoiceId: true } },
                    currentMc: { select: { id: true, name: true } },
                },
                skip: (page - 1) * limit,
                take: limit,
                orderBy,
            }),
            prisma.account.count({ where }),
        ]);

        // Optimized Aggregation: Fetch spending sums using groupBy
        const accountIds = accounts.map(a => a.id);
        let rangeSpendingMap: Record<string, number> = {};

        if (accountIds.length > 0) {
            const spendingAggs = await prisma.spendingRecord.groupBy({
                by: ['accountId'],
                where: {
                    accountId: { in: accountIds },
                    spendingDate: { gte: spendingStart }
                },
                _sum: {
                    amount: true
                }
            });

            spendingAggs.forEach(agg => {
                rangeSpendingMap[agg.accountId] = Number(agg._sum.amount || 0);
            });
        }

        const accountsWithSpending = accounts.map((acc: any) => ({
            ...acc,
            rangeSpending: rangeSpendingMap[acc.id] || 0
        }));

        res.json({
            data: accountsWithSpending,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error('Get accounts error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/accounts/unlinked - Get accounts not linked to MI
router.get('/unlinked', authenticateToken, canView, async (req: AuthRequest, res: Response) => {
    try {
        const accounts = await prisma.account.findMany({
            where: { currentMiId: null, status: 'ACTIVE' },
            include: {
                batch: { select: { id: true, mccAccountName: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(accounts);
    } catch (error) {
        console.error('Get unlinked accounts error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/accounts/unassigned - Get accounts not assigned to MC
router.get('/unassigned', authenticateToken, canView, async (req: AuthRequest, res: Response) => {
    try {
        const accounts = await prisma.account.findMany({
            where: { currentMcId: null, status: 'ACTIVE' },
            include: {
                batch: { select: { id: true, mccAccountName: true } },
                currentMi: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(accounts);
    } catch (error) {
        console.error('Get unassigned accounts error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/accounts - Create account
router.post('/', authenticateToken, isBuyer, async (req: AuthRequest, res: Response) => {
    try {
        const validation = createAccountSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({ error: validation.error.errors });
            return;
        }

        // Check if account ID already exists
        const existing = await prisma.account.findUnique({
            where: { googleAccountId: validation.data.googleAccountId },
        });
        if (existing) {
            res.status(409).json({ error: 'Account ID already exists' });
            return;
        }

        const account = await prisma.account.create({
            data: {
                ...validation.data,
                status: validation.data.status as any
            },
            include: {
                batch: { select: { id: true, mccAccountName: true } },
            },
        });

        // Update batch counts
        await prisma.accountBatch.update({
            where: { id: validation.data.batchId },
            data: {
                totalAccounts: { increment: 1 },
                liveAccounts: { increment: 1 },
            },
        });

        await logActivity({
            userId: req.user!.id,
            action: 'CREATE',
            entityType: 'Account',
            entityId: account.id,
            newValues: validation.data,
            description: `Tạo tài khoản ${account.googleAccountId}`,
            ipAddress: req.ip,
        });

        res.status(201).json(account);
    } catch (error) {
        console.error('Create account error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/accounts/:id
router.get('/:id', authenticateToken, canView, async (req: AuthRequest, res: Response) => {
    try {
        const account = await prisma.account.findUnique({
            where: { id: req.params.id as string },
            include: {
                batch: true,
                currentMi: true,
                currentMc: true,
                miHistories: {
                    include: {
                        invoiceMcc: { select: { id: true, name: true, mccInvoiceId: true } },
                        linkedBy: { select: { id: true, fullName: true } },
                        unlinkedBy: { select: { id: true, fullName: true } },
                    },
                    orderBy: { linkedAt: 'desc' },
                },
                mcHistories: {
                    include: {
                        customer: { select: { id: true, name: true } },
                        assignedBy: { select: { id: true, fullName: true } },
                        unassignedBy: { select: { id: true, fullName: true } },
                    },
                    orderBy: { assignedAt: 'desc' },
                },
                snapshots: {
                    orderBy: { snapshotAt: 'desc' },
                    take: 10,
                },
            },
        });

        if (!account) {
            res.status(404).json({ error: 'Account not found' });
            return;
        }

        res.json(account);
    } catch (error) {
        console.error('Get account error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /api/accounts/:id
router.put('/:id', authenticateToken, isBuyer, async (req: AuthRequest, res: Response) => {
    try {
        const existing = await prisma.account.findUnique({ where: { id: req.params.id as string } });
        if (!existing) {
            res.status(404).json({ error: 'Account not found' });
            return;
        }

        const { accountName, status, currency, timezone } = req.body;
        const account = await prisma.account.update({
            where: { id: req.params.id as string },
            data: { accountName, status, currency, timezone },
        });

        // Update batch counts if status changed
        if (status && status !== existing.status) {
            if (status === 'ACTIVE') {
                await prisma.accountBatch.update({
                    where: { id: existing.batchId },
                    data: { liveAccounts: { increment: 1 } },
                });
            } else if (existing.status === 'ACTIVE') {
                await prisma.accountBatch.update({
                    where: { id: existing.batchId },
                    data: { liveAccounts: { decrement: 1 } },
                });
            }
        }

        await logActivity({
            userId: req.user!.id,
            action: 'UPDATE',
            entityType: 'Account',
            entityId: account.id,
            oldValues: existing,
            newValues: account,
            description: `Cập nhật tài khoản ${account.googleAccountId}`,
            ipAddress: req.ip,
        });

        res.json(account);
    } catch (error) {
        console.error('Update account error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// POST /api/accounts/bulk-update-status
router.post('/bulk-update-status', authenticateToken, isBuyer, async (req: AuthRequest, res: Response) => {
    try {
        const { accountIds, status } = req.body;
        if (!Array.isArray(accountIds) || accountIds.length === 0 || !status) {
            res.status(400).json({ error: 'Account IDs and status required' });
            return;
        }

        const validStatuses = ['ACTIVE', 'INACTIVE'];
        if (!validStatuses.includes(status)) {
            res.status(400).json({ error: 'Invalid status' });
            return;
        }

        const results = [];
        for (const accountId of accountIds) {
            const existing = await prisma.account.findUnique({ where: { id: accountId } });
            if (!existing) continue;

            const account = await prisma.account.update({
                where: { id: accountId },
                data: { status },
            });

            // Update batch counts if status changed
            if (status !== existing.status) {
                if (status === 'ACTIVE') {
                    await prisma.accountBatch.update({
                        where: { id: existing.batchId },
                        data: { liveAccounts: { increment: 1 } },
                    });
                } else if (existing.status === 'ACTIVE') {
                    await prisma.accountBatch.update({
                        where: { id: existing.batchId },
                        data: { liveAccounts: { decrement: 1 } },
                    });
                }
            }

            await logActivity({
                userId: req.user!.id,
                action: 'UPDATE',
                entityType: 'Account',
                entityId: account.id,
                oldValues: { status: existing.status },
                newValues: { status: account.status },
                description: `Cập nhật trạng thái tài khoản ${account.googleAccountId} thành ${status}`,
                ipAddress: req.ip,
            });

            results.push(accountId);
        }

        res.json({ message: `Updated ${results.length} accounts`, updatedAccountIds: results });
    } catch (error) {
        console.error('Bulk update status error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/accounts/bulk-unlink-mi
router.post('/bulk-unlink-mi', authenticateToken, isLinker, async (req: AuthRequest, res: Response) => {
    try {
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
                include: { currentMi: true }
            });
            if (!account || !account.currentMiId) continue;

            // Update history
            await prisma.accountMIHistory.updateMany({
                where: {
                    accountId: accountId,
                    invoiceMccId: account.currentMiId,
                    unlinkedAt: null,
                },
                data: {
                    unlinkedAt: now,
                    unlinkedById: req.user!.id,
                    reason: 'MIGRATION', // Or manual unlink
                },
            });

            // Update account
            await prisma.account.update({
                where: { id: accountId },
                data: { currentMiId: null },
            });

            // Update MI counts
            await prisma.invoiceMCC.update({
                where: { id: account.currentMiId },
                data: { linkedAccountsCount: { decrement: 1 } },
            });

            await logActivity({
                userId: req.user!.id,
                action: 'UNLINK_MI',
                entityType: 'Account',
                entityId: accountId,
                oldValues: { invoiceMccId: account.currentMiId, invoiceMccName: account.currentMi?.name },
                description: `Gỡ MI khỏi tài khoản ${account.googleAccountId}`,
                ipAddress: req.ip,
            });

            results.push(accountId);
        }

        res.json({ message: `Unlinked ${results.length} accounts`, unlinkedAccountIds: results });
    } catch (error) {
        console.error('Bulk unlink MI error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/accounts/bulk-unassign-mc
router.post('/bulk-unassign-mc', authenticateToken, isAssigner, async (req: AuthRequest, res: Response) => {
    try {
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
            if (!account || !account.currentMcId) continue;

            // Update history
            await prisma.accountMCHistory.updateMany({
                where: {
                    accountId: accountId,
                    customerId: account.currentMcId,
                    unassignedAt: null,
                },
                data: {
                    unassignedAt: now,
                    unassignedById: req.user!.id,
                    reason: 'REASSIGN', // Or manual unassign
                },
            });

            // Update account
            await prisma.account.update({
                where: { id: accountId },
                data: { currentMcId: null },
            });

            // Update Customer counts
            await prisma.customer.update({
                where: { id: account.currentMcId },
                data: {
                    totalAccounts: { decrement: 1 },
                    activeAccounts: { decrement: 1 },
                },
            });

            await logActivity({
                userId: req.user!.id,
                action: 'UNASSIGN_MC',
                entityType: 'Account',
                entityId: accountId,
                oldValues: { customerId: account.currentMcId, customerName: account.currentMc?.name },
                description: `Gỡ khách hàng khỏi tài khoản ${account.googleAccountId}`,
                ipAddress: req.ip,
            });

            results.push(accountId);
        }

        res.json({ message: `Unassigned ${results.length} accounts`, unassignedAccountIds: results });
    } catch (error) {
        console.error('Bulk unassign MC error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;

