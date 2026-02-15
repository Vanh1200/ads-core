import prisma from '../../infrastructure/database/prisma';
import { logActivity } from '../../infrastructure/logging/ActivityLogger';

export class CreditLinkingService {
    async suggest(requirements: Array<{ timezone: string; year: number; currency: string; count: number }>) {
        const suggestions: any[] = [];

        for (const req of requirements) {
            const batches = await prisma.accountBatch.findMany({
                where: { timezone: req.timezone, year: req.year, status: 'ACTIVE' } as any,
                orderBy: { readiness: 'desc' } as any,
                include: {
                    accounts: {
                        where: { currentMiId: null, currentMcId: null, status: 'ACTIVE', currency: req.currency },
                        take: req.count * 2,
                    },
                },
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
                            id: a.id, accountName: a.accountName, googleAccountId: a.googleAccountId,
                            timezone: batch.timezone, currency: req.currency, batchName: batch.mccAccountName, readiness: batch.readiness,
                        })),
                        accountsCount: accountsToTake.length,
                        otherBatches: (batches as any[])
                            .filter(b => b.id !== batch.id && b.accounts.length > 0)
                            .map(b => ({ id: b.id, name: b.mccAccountName, readiness: b.readiness, availableCount: b.accounts.length })),
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

        return suggestions;
    }

    async execute(links: Array<{ accountIds: string[] }>, invoiceMccId: string | undefined, newInvoiceMcc: any | undefined, userId: string, ipAddress?: string) {
        let finalMiId = invoiceMccId;

        const result = await prisma.$transaction(async (tx: any) => {
            if (newInvoiceMcc) {
                const mi = await tx.invoiceMCC.create({
                    data: { name: newInvoiceMcc.name, mccInvoiceId: newInvoiceMcc.mccInvoiceId, partnerId: newInvoiceMcc.partnerId, createdById: userId, status: 'ACTIVE' },
                });
                finalMiId = mi.id;

                await logActivity({ userId, action: 'CREATE', entityType: 'InvoiceMCC', entityId: mi.id, newValues: newInvoiceMcc, description: `Tạo Invoice MCC ${mi.name} từ công cụ liên kết nhanh`, ipAddress });
            }

            if (!finalMiId) throw new Error('BAD_REQUEST: No Invoice MCC provided or created');

            const allAccountIds = links.flatMap(l => l.accountIds);
            await tx.account.updateMany({ where: { id: { in: allAccountIds } }, data: { currentMiId: finalMiId } });
            await tx.accountMIHistory.createMany({
                data: allAccountIds.map(accountId => ({ accountId, invoiceMccId: finalMiId as string, linkedById: userId, linkedAt: new Date(), reason: 'INITIAL' })),
            });
            await tx.invoiceMCC.update({ where: { id: finalMiId }, data: { linkedAccountsCount: { increment: allAccountIds.length }, activeAccountsCount: { increment: allAccountIds.length } } });

            return { miId: finalMiId, accountCount: allAccountIds.length };
        });

        await logActivity({ userId, action: 'LINK_MI', entityType: 'InvoiceMCC', entityId: result.miId, newValues: { accountCount: result.accountCount, links }, description: `Nối ${result.accountCount} tài khoản vào MI thông qua công cụ liên kết nhanh`, ipAddress });
        return { success: true, ...result };
    }
}

export const creditLinkingService = new CreditLinkingService();
