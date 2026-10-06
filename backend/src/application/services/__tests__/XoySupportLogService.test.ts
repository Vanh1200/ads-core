import { beforeEach, describe, expect, it } from 'vitest';
import { prismaMock } from '../../../__tests__/setup';
import { XoySupportLogService } from '../XoySupportLogService';

describe('XoySupportLogService', () => {
    beforeEach(() => {
        prismaMock.$transaction.mockImplementation(async (action: any) => action(prismaMock));
        prismaMock.$queryRawUnsafe.mockResolvedValue([{ paused: false }]);
    });

    it('acknowledges legacy noise and progress while updating counters without raw event rows', async () => {
        prismaMock.xoySupportLogRun.upsert.mockResolvedValue({ id: 'run-db-1', supportId: 'SUP-TEST' } as any);
        const result = await new XoySupportLogService().ingest('device-1', {
            runId: 'run-1', events: [
                { eventId: 'noise', success: true, text: '[13-07-14] ✓ [#KN-TEST] → [49/50] Kháng 123...' },
                { eventId: 'retry', success: true, eventType: 'manual_log_retry', text: '→ Nhóm 2/3: 10 tài khoản', metadata: { source: 'manual_retry' } },
                { eventId: 'progress', eventType: 'job_progress', jobType: 'appeal', text: 'Tiến độ 49/50', metadata: { totalTargets: 50, processedTargets: 49, successfulTargets: 45, failedTargets: 4, jobStatus: 'RUNNING' } }
            ]
        });
        expect(result).toEqual({ supportId: 'SUP-TEST', acceptedEventIds: ['noise', 'retry', 'progress'] });
        expect(prismaMock.xoySupportLogEvent.createMany).not.toHaveBeenCalled();
        expect(prismaMock.xoySupportLogRun.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ targetTotal: 50, processedTargets: 49, successfulTargets: 45, failedTargets: 4, jobStatus: 'RUNNING' }) }));
    });

    it('retains account outcomes, errors, templates, lifecycle and unknown messages', async () => {
        prismaMock.xoySupportLogRun.upsert.mockResolvedValue({ id: 'run-db-1', supportId: 'SUP-TEST' } as any);
        const events = [
            { eventId: 'outcome', success: true, text: '✓ 123: đã gửi kháng nghị.', fileLine: 'duplicate text' },
            { eventId: 'skip', success: true, text: '⏭ 123: không bị tạm ngưng — đã bỏ qua.' },
            { eventId: 'error', success: false, text: '→ 123: lỗi kết nối.' },
            { eventId: 'rpc', success: true, text: '→ failed', eventType: 'rpc_error', metadata: { httpStatus: 500 } },
            { eventId: 'template', success: true, text: '→ template', eventType: 'appeal_template_started', metadata: { template: { appealDomain: 'example.com' } } },
            { eventId: 'finish', success: false, text: 'Đã tạm dừng.', eventType: 'job_finished', metadata: { jobStatus: 'PAUSED' } },
            { eventId: 'unknown', text: '→ legacy success unknown' },
            { eventId: 'structured', success: true, text: '→ diagnostic', metadata: { accountId: '123' } },
            { eventId: 'poll', success: true, text: '[13-07-14] ✓ [#BC-TEST] ⏳ [2/30] Đang kiểm tra trạng thái file báo cáo chiến dịch (GetState)...' },
        ];
        const result = await new XoySupportLogService().ingest('device-1', { runId: 'run-1', events });
        const stored = (prismaMock.xoySupportLogEvent.createMany.mock.calls[0][0] as any).data;
        expect(stored.map((e: any) => e.eventId)).toEqual(events.slice(0, -1).map(e => e.eventId));
        expect(stored[0]).not.toHaveProperty('fileLine');
        expect(stored.find((e: any) => e.eventId === 'rpc').metadata).toEqual({ httpStatus: 500 });
        expect(stored.find((e: any) => e.eventId === 'template').metadata.template.appealDomain).toBe('example.com');
        expect(result.acceptedEventIds).toEqual(events.map(e => e.eventId));
    });

    it('does not rewrite an existing job summary for an intermediate-only upload', async () => {
        prismaMock.xoySupportLogRun.upsert.mockResolvedValue({ id: 'run-db-1', supportId: 'SUP-TEST', jobId: 'job-1', traceId: '#KN-TEST', jobType: 'appeal' } as any);
        const result = await new XoySupportLogService().ingest('device-1', { runId: 'run-1', events: [
            { eventId: 'noise', jobId: 'job-1', traceId: '#KN-TEST', jobType: 'appeal', success: true, text: '→ 123: đang kiểm tra trạng thái kháng nghị.' }
        ] });
        expect(result.acceptedEventIds).toEqual(['noise']);
        expect(prismaMock.xoySupportLogEvent.createMany).not.toHaveBeenCalled();
        expect(prismaMock.xoySupportLogRun.update).not.toHaveBeenCalled();
    });

    it('rejects ingestion during maintenance without acknowledging or writing any events', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValue([{ paused: true }]);
        await expect(new XoySupportLogService().ingest('device-1', {
            runId: 'run-1', events: [{ eventId: 'event-1', text: 'Pending log' }]
        })).rejects.toThrow('XOY_LOG_MAINTENANCE');
        expect(prismaMock.xoySupportLogRun.upsert).not.toHaveBeenCalled();
        expect(prismaMock.xoySupportLogEvent.createMany).not.toHaveBeenCalled();
    });
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

    it('returns a paginated job list without embedding every event for a customer', async () => {
        prismaMock.xoySupportLogRun.findMany.mockResolvedValue([] as any);
        prismaMock.xoySupportLogRun.count.mockResolvedValue(61);

        const result = await new XoySupportLogService().listByLicense('license-1', { page: '2', limit: '30' });

        expect(prismaMock.xoySupportLogRun.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 30, take: 30 }));
        expect(result.pagination).toEqual({ page: 2, limit: 30, total: 61, totalPages: 3 });
    });
});
