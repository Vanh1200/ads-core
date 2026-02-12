import { Router, Response } from 'express';
import prisma from '../config/database';
import { authenticateToken, AuthRequest, isLinker } from '../middleware/auth.middleware';
import { quickLinkSuggestSchema, quickLinkExecuteSchema } from '../utils/validators';
import logActivity from '../utils/activityLogger';

const router = Router();

// POST /api/credit-linking/suggest - Get account suggestions based on requirements
router.post('/suggest', authenticateToken, isLinker, async (req: AuthRequest, res: Response) => {
    try {
        const validation = quickLinkSuggestSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({ error: validation.error.errors });
            return;
        }

        const { requirements } = validation.data;
        const suggestions: any[] = [];

        for (const req of requirements) {
            // Find batches matching timezone and year
            const batches = await prisma.accountBatch.findMany({
                where: {
                    timezone: req.timezone,
                    year: req.year,
                    status: 'ACTIVE',
                } as any,
                orderBy: { readiness: 'desc' } as any,
                include: {
                    accounts: {
                        where: {
                            currentMiId: null,
                            currentMcId: null,
                            status: 'ACTIVE',
                            currency: req.currency,
                        },
                        take: req.count * 2, // Take extra for buffer
                    }
                }
            });

            let accountsNeeded = req.count;
            const suggestedLinks: any[] = [];

            for (const batch of batches as any[]) {
                if (accountsNeeded <= 0) break;

                const accountsToTake = batch.accounts.slice(0, accountsNeeded);
                if (accountsToTake.length > 0) {
                    suggestedLinks.push({
                        batchId: batch.id,
                        batchName: batch.mccAccountName,
                        readiness: batch.readiness,
                        accountIds: accountsToTake.map((a: any) => a.id),
                        accounts: accountsToTake.map((a: any) => ({
                            id: a.id,
                            accountName: a.accountName,
                            googleAccountId: a.googleAccountId,
                            timezone: batch.timezone,
                            currency: req.currency, // Account currency matched requirement
                            batchName: batch.mccAccountName,
                            readiness: batch.readiness
                        })),
                        accountsCount: accountsToTake.length,
                        // Provide other suitable batches for swapping
                        otherBatches: (batches as any[])
                            .filter(b => b.id !== batch.id && b.accounts.length > 0)
                            .map(b => ({ id: b.id, name: b.mccAccountName, readiness: b.readiness, availableCount: b.accounts.length }))
                    });
                    accountsNeeded -= accountsToTake.length;
                }
            }

            suggestions.push({
                requirement: req,
                links: suggestedLinks,
                isFulfilled: accountsNeeded <= 0,
                missingCount: accountsNeeded > 0 ? accountsNeeded : 0,
            });
        }

        res.json(suggestions);
    } catch (error) {
        console.error('Suggest accounts error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/credit-linking/execute - Execute the linking
router.post('/execute', authenticateToken, isLinker, async (req: AuthRequest, res: Response) => {
    try {
        const validation = quickLinkExecuteSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({ error: validation.error.errors });
            return;
        }

        const { links, invoiceMccId, newInvoiceMcc } = validation.data;
        let finalMiId = invoiceMccId;

        // Transaction to ensure atomicity
        const result = await prisma.$transaction(async (tx) => {
            // 1. Create New MI if requested
            if (newInvoiceMcc) {
                const mi = await tx.invoiceMCC.create({
                    data: {
                        name: newInvoiceMcc.name,
                        mccInvoiceId: newInvoiceMcc.mccInvoiceId,
                        partnerId: newInvoiceMcc.partnerId,
                        createdById: req.user!.id,
                        status: 'ACTIVE',
                    }
                });
                finalMiId = mi.id;

                // Log MI creation
                await logActivity({
                    userId: req.user!.id,
                    action: 'CREATE',
                    entityType: 'InvoiceMCC',
                    entityId: mi.id,
                    newValues: newInvoiceMcc,
                    description: `Tạo Invoice MCC ${mi.name} từ công cụ liên kết nhanh`,
                    ipAddress: req.ip,
                });
            }

            if (!finalMiId) {
                throw new Error('No Invoice MCC provided or created');
            }

            // 2. Perform linking
            const allAccountIds = links.flatMap(l => l.accountIds);

            // Update accounts
            await tx.account.updateMany({
                where: { id: { in: allAccountIds } },
                data: { currentMiId: finalMiId }
            });

            // Create history records
            await tx.accountMIHistory.createMany({
                data: allAccountIds.map(accountId => ({
                    accountId,
                    invoiceMccId: finalMiId as string,
                    linkedById: req.user!.id,
                    linkedAt: new Date(),
                    reason: 'INITIAL',
                }))
            });

            // Update counts for MI
            const mi = await tx.invoiceMCC.update({
                where: { id: finalMiId },
                data: {
                    linkedAccountsCount: { increment: allAccountIds.length },
                    activeAccountsCount: { increment: allAccountIds.length }, // Assuming suggested accounts are active
                }
            });

            return { miId: finalMiId, accountCount: allAccountIds.length };
        });

        await logActivity({
            userId: req.user!.id,
            action: 'LINK_MI',
            entityType: 'InvoiceMCC',
            entityId: result.miId,
            newValues: { accountCount: result.accountCount, links },
            description: `Nối ${result.accountCount} tài khoản vào MI thông qua công cụ liên kết nhanh`,
            ipAddress: req.ip,
        });

        res.json({ success: true, ...result });
    } catch (error: any) {
        console.error('Execute linking error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

export default router;
