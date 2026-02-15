import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spendingService } from '../SpendingService';
import { prismaMock } from '../../../__tests__/setup';
import { Decimal } from '@prisma/client/runtime/library';

describe('SpendingService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('calculateRecords', () => {
        it('should throw error if account not found', async () => {
            prismaMock.account.findUnique.mockResolvedValue(null);

            await expect(spendingService.calculateRecords('acc-1', '2026-02-13'))
                .rejects.toThrow('NOT_FOUND: Account not found');
        });

        it('should throw error if no snapshots found', async () => {
            prismaMock.account.findUnique.mockResolvedValue({ id: 'acc-1' } as any);
            prismaMock.spendingSnapshot.findMany.mockResolvedValue([]);

            await expect(spendingService.calculateRecords('acc-1', '2026-02-13'))
                .rejects.toThrow('BAD_REQUEST: No snapshots found for this date');
        });

        it('should create records based on snapshots and update account total', async () => {
            const account = { id: 'acc-1', currency: 'USD', googleAccountId: '123' } as any;
            const snapshots = [
                { id: 's1', cumulativeAmount: new Decimal(100), snapshotAt: new Date('2026-02-13T10:00:00Z'), invoiceMccId: 'mi1', customerId: 'mc1' },
                { id: 's2', cumulativeAmount: new Decimal(250), snapshotAt: new Date('2026-02-13T14:00:00Z'), invoiceMccId: 'mi1', customerId: 'mc1' },
            ] as any;

            prismaMock.account.findUnique.mockResolvedValue(account);
            prismaMock.spendingSnapshot.findMany.mockResolvedValue(snapshots);
            (prismaMock.spendingRecord.create as any).mockImplementation(({ data }: any) => Promise.resolve({ id: 'r-' + Math.random(), ...data }));
            prismaMock.spendingRecord.aggregate.mockResolvedValue({ _sum: { amount: new Decimal(250) } } as any);

            const result = await spendingService.calculateRecords('acc-1', '2026-02-13');

            // First snapshot: 100 - 0 = 100
            // Second snapshot: 250 - 100 = 150
            expect(prismaMock.spendingRecord.create).toHaveBeenCalledTimes(2);
            expect(prismaMock.spendingRecord.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
                data: expect.objectContaining({ amount: new Decimal(100) })
            }));
            expect(prismaMock.spendingRecord.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
                data: expect.objectContaining({ amount: new Decimal(150) })
            }));

            expect(prismaMock.account.update).toHaveBeenCalledWith({
                where: { id: 'acc-1' },
                data: expect.objectContaining({ totalSpending: new Decimal(250) })
            });

            expect(result.records).toHaveLength(2);
        });
    });

    describe('createSnapshot', () => {
        it('should create a snapshot and log activity', async () => {
            const account = { id: 'acc-1', googleAccountId: '123', currentMiId: 'mi1', currentMcId: 'mc1' } as any;
            prismaMock.account.findUnique.mockResolvedValue(account);
            prismaMock.spendingSnapshot.create.mockResolvedValue({ id: 'snap-1', accountId: 'acc-1' } as any);

            const result = await spendingService.createSnapshot(
                { accountId: 'acc-1', spendingDate: '2026-02-13', cumulativeAmount: 500, snapshotType: 'MANUAL' }
            );

            expect(prismaMock.spendingSnapshot.create).toHaveBeenCalled();
            expect(result.id).toBe('snap-1');
        });
    });
});
