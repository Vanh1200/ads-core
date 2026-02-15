import { describe, it, expect, vi, beforeEach } from 'vitest';
import { creditLinkingService } from '../CreditLinkingService';
import { prismaMock } from '../../../__tests__/setup';

describe('CreditLinkingService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('suggest', () => {
        it('should return suggestions based on requirements', async () => {
            const requirements = [{ timezone: 'GMT+7', year: 2024, currency: 'USD', count: 1 }];
            const batches = [
                {
                    id: 'b1',
                    mccAccountName: 'Batch 1',
                    readiness: 100,
                    timezone: 'GMT+7',
                    accounts: [
                        { id: 'a1', accountName: 'Acc 1', googleAccountId: '123' },
                        { id: 'a2', accountName: 'Acc 2', googleAccountId: '456' },
                    ],
                },
            ] as any;

            prismaMock.accountBatch.findMany.mockResolvedValue(batches);

            const result = await creditLinkingService.suggest(requirements);

            expect(result).toHaveLength(1);
            expect(result[0].links).toHaveLength(1);
            expect(result[0].links[0].accountIds).toEqual(['a1']);
            expect(result[0].isFulfilled).toBe(true);
        });
    });

    describe('execute', () => {
        it('should throw error if no MI provided or created', async () => {
            prismaMock.$transaction.mockImplementation(async (callback: any) => await callback(prismaMock));

            await expect(creditLinkingService.execute([{ accountIds: ['a1'] }], undefined, undefined, 'user-1'))
                .rejects.toThrow('BAD_REQUEST: No Invoice MCC provided or created');
        });

        it('should link accounts to MI within a transaction', async () => {
            const links = [{ accountIds: ['a1', 'a2'] }];
            prismaMock.$transaction.mockImplementation(async (callback: any) => await callback(prismaMock));
            prismaMock.invoiceMCC.update.mockResolvedValue({ id: 'mi1' } as any);

            const result = await creditLinkingService.execute(links, 'mi1', undefined, 'user-1');

            expect(prismaMock.account.updateMany).toHaveBeenCalledWith({
                where: { id: { in: ['a1', 'a2'] } },
                data: { currentMiId: 'mi1' },
            });
            expect(prismaMock.accountMIHistory.createMany).toHaveBeenCalled();
            expect(result.miId).toBe('mi1');
            expect(result.accountCount).toBe(2);
        });

        it('should create a new MI if provided', async () => {
            const links = [{ accountIds: ['a1'] }];
            const newMi = { name: 'New MI', partnerId: 'p1', mccInvoiceId: 'inv1' };
            prismaMock.$transaction.mockImplementation(async (callback) => await callback(prismaMock));
            prismaMock.invoiceMCC.create.mockResolvedValue({ id: 'new-mi-id', name: 'New MI' } as any);

            const result = await creditLinkingService.execute(links, undefined, newMi, 'user-1');

            expect(prismaMock.invoiceMCC.create).toHaveBeenCalled();
            expect(result.miId).toBe('new-mi-id');
        });
    });
});
