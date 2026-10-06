import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { prismaMock } from '../../../__tests__/setup';
import { expiredXoySupportLogFilter, pruneXoySupportLogs, startXoySupportLogRetention } from '../XoySupportLogRetention';

afterEach(() => vi.useRealTimers());

describe('XOY raw log retention', () => {
    beforeEach(() => {
        prismaMock.$transaction.mockImplementation(async (action: any) => action(prismaMock));
        prismaMock.$queryRawUnsafe.mockResolvedValue([{ paused: false }]);
    });

    it('does not delete logs while a restore is in progress', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValue([{ paused: true }]);
        await expect(pruneXoySupportLogs()).rejects.toThrow('XOY_LOG_MAINTENANCE');
        expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    });
    it('manual cleanup counts and verification exclude the same permanent events as scheduled deletion', () => {
        const cutoff = new Date('2026-10-04T10:00:00Z');
        expect(expiredXoySupportLogFilter(cutoff)).toEqual({
            createdAt: { lt: cutoff },
            eventType: { notIn: ['appeal_template_started', 'appeal_summary'] },
        });
    });
    it('uses a rolling 48-hour receipt cutoff and deletes only raw logs in bounded batches', async () => {
        prismaMock.$queryRaw.mockResolvedValueOnce([{ count: 2_000 }]).mockResolvedValueOnce([{ count: 7 }]);
        const result = await pruneXoySupportLogs(new Date('2026-10-04T10:00:00Z'));

        expect(result).toEqual({ cutoff: new Date('2026-10-02T10:00:00Z'), deletedEvents: 2_007, hasMore: false });
        expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
        const [sql, ...values] = prismaMock.$queryRaw.mock.calls[0];
        const query = Prisma.sql(sql as TemplateStringsArray, ...values);
        expect(query.sql).toMatch(/WHERE created_at < \?/);
        expect(query.sql).toContain('event_type NOT IN (?,?)');
        expect(query.sql).toContain('FOR UPDATE SKIP LOCKED');
        expect(query.sql).toContain('DELETE FROM xoy_support_log_events');
        expect(query.values).toEqual([result.cutoff, 'appeal_template_started', 'appeal_summary', 2_000]);
        expect(prismaMock.xoySupportLogRun.deleteMany).not.toHaveBeenCalled();
    });

    it('caps one scheduled sweep so a backlog does not monopolize the database', async () => {
        prismaMock.$queryRaw.mockResolvedValue([{ count: 2_000 }]);
        const result = await pruneXoySupportLogs(new Date(), 2);
        expect(result.deletedEvents).toBe(4_000);
        expect(result.hasMore).toBe(true);
        expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
    });

    it('does not overlap hourly sweeps while a database operation is pending', async () => {
        vi.useFakeTimers();
        let resolveQuery!: (result: Array<{ count: number }>) => void;
        prismaMock.$queryRaw.mockReturnValue(new Promise(resolve => { resolveQuery = resolve; }) as any);
        const stop = startXoySupportLogRetention();
        try {
            await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
            expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
            resolveQuery([{ count: 0 }]);
            await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
            expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
        } finally { stop(); }
    });

    it('retries next hour after failure without an unhandled rejection', async () => {
        vi.useFakeTimers();
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        prismaMock.$queryRaw.mockRejectedValueOnce(new Error('Database unavailable')).mockResolvedValue([{ count: 0 }]);
        const stop = startXoySupportLogRetention();
        try {
            await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
            expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
            expect(log).toHaveBeenCalledTimes(1);
            stop();
            await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
            expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
        } finally { stop(); log.mockRestore(); }
    });
});
