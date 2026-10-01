import { describe, expect, it } from 'vitest';
import { prismaMock } from '../../../__tests__/setup';
import { XoySupportLogService } from '../XoySupportLogService';

describe('XoySupportLogService', () => {
    it('omits empty JSON metadata so an ordinary log line cannot reject its batch', async () => {
        prismaMock.xoySupportLogRun.upsert.mockResolvedValue({ id: 'run-db-1', supportId: 'SUP-0E32B137' } as any);
        prismaMock.xoySupportLogEvent.createMany.mockResolvedValue({ count: 1 } as any);

        const result = await new XoySupportLogService().ingest('device-1', {
            runId: 'run-1',
            events: [{ eventId: 'event-1', eventType: 'log', metadata: null, text: 'Đã tạm dừng.' }]
        });

        const createManyInput = prismaMock.xoySupportLogEvent.createMany.mock.calls[0][0] as any;
        expect(createManyInput.data[0]).not.toHaveProperty('metadata');
        expect(result.supportId).toBe('SUP-0E32B137');
    });

    it('persists the job type from a manual retry when lifecycle telemetry is unavailable', async () => {
        prismaMock.xoySupportLogRun.upsert.mockResolvedValue({ id: 'run-db-1', supportId: 'SUP-0E32B137' } as any);
        prismaMock.xoySupportLogEvent.createMany.mockResolvedValue({ count: 1 } as any);

        await new XoySupportLogService().ingest('device-1', {
            runId: 'run-1',
            events: [{ eventId: 'event-1', eventType: 'manual_log_retry', jobId: 'job-1', traceId: '#KN-TEST', jobType: 'appeal', text: 'Đã tạm dừng.' }]
        });

        expect(prismaMock.xoySupportLogRun.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ jobId: 'job-1', traceId: '#KN-TEST', jobType: 'appeal' }) }));
    });

    it('excludes legacy runs without a job type from operational metrics', async () => {
        const updatedAt = new Date('2026-10-01T10:00:00.000Z');
        prismaMock.xoySupportLogRun.findMany.mockResolvedValue([
            { id: 'legacy', supportId: 'SUP-LEGACY', jobType: null, jobStatus: null, targetTotal: 0, processedTargets: 0, successfulTargets: 0, failedTargets: 0, skippedTargets: 0, startedAt: null, finishedAt: null, updatedAt, device: { license: { id: 'license-1', name: 'Khách A' } } },
            { id: 'appeal', supportId: 'SUP-APPEAL', jobType: 'appeal', jobStatus: 'COMPLETED', targetTotal: 2, processedTargets: 2, successfulTargets: 1, failedTargets: 0, skippedTargets: 1, startedAt: updatedAt, finishedAt: updatedAt, updatedAt, device: { license: { id: 'license-1', name: 'Khách A' } } },
        ] as any);
        (prismaMock.xoyLicense.groupBy as any).mockResolvedValue([] as any);
        prismaMock.xoySupportLogEvent.count.mockResolvedValue(0);

        const result = await new XoySupportLogService().operationalMetrics({});

        expect(result.overview.jobs).toBe(1);
        expect(result.byJobType).toEqual([expect.objectContaining({ jobType: 'appeal', jobs: 1 })]);
        expect(result.recentJobs).toHaveLength(1);
        expect(result.recentJobs[0].supportId).toBe('SUP-APPEAL');
        const query = prismaMock.xoySupportLogRun.findMany.mock.calls[0][0] as any;
        expect(query.select).not.toHaveProperty('inputIds');
        expect(query.select).not.toHaveProperty('inputMccIds');
    });

    it('paginates the events of one support job instead of loading its full history', async () => {
        prismaMock.xoySupportLogRun.findUnique.mockResolvedValue({ id: 'run-db-1', supportId: 'SUP-0E32B137', events: [] } as any);
        prismaMock.xoySupportLogEvent.count.mockResolvedValue(18_874);

        const result = await new XoySupportLogService().getBySupportId('SUP-0E32B137', { page: '3', limit: '50' });

        expect(prismaMock.xoySupportLogRun.findUnique).toHaveBeenCalledWith(expect.objectContaining({
            include: expect.objectContaining({ events: expect.objectContaining({ skip: 100, take: 50 }) }),
        }));
        expect(result.pagination).toEqual({ page: 3, limit: 50, total: 18_874, totalPages: 378 });
    });
});
