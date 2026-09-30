import { describe, expect, it } from 'vitest';
import { prismaMock } from '../../../__tests__/setup';
import { XoySupportLogService } from '../XoySupportLogService';

describe('XoySupportLogService', () => {
    it('omits empty JSON metadata so an ordinary log line cannot reject its batch', async () => {
        prismaMock.xoySupportLogRun.upsert.mockResolvedValue({ id: 'run-db-1', supportId: 'SUP-20260930-0E32B137' } as any);
        prismaMock.xoySupportLogEvent.createMany.mockResolvedValue({ count: 1 } as any);

        const result = await new XoySupportLogService().ingest('device-1', {
            runId: 'run-1',
            events: [{ eventId: 'event-1', eventType: 'log', metadata: null, text: 'Đã tạm dừng.' }]
        });

        const createManyInput = prismaMock.xoySupportLogEvent.createMany.mock.calls[0][0] as any;
        expect(createManyInput.data[0]).not.toHaveProperty('metadata');
        expect(result.supportId).toBe('SUP-20260930-0E32B137');
    });
});
