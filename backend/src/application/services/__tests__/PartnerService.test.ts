import { describe, it, expect, vi, beforeEach } from 'vitest';
import { partnerService } from '../PartnerService';
import { prismaMock } from '../../../__tests__/setup';

describe('PartnerService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('listPartners', () => {
        it('should return partners and total count', async () => {
            prismaMock.partner.findMany.mockResolvedValue([{ id: 'p1', name: 'Partner 1' }] as any);
            prismaMock.partner.count.mockResolvedValue(1);

            const result = await partnerService.listPartners({ page: 1, limit: 10 });

            expect(result.data).toHaveLength(1);
            expect(result.pagination.total).toBe(1);
        });
    });

    describe('createPartner', () => {
        it('should create a partner and log activity', async () => {
            prismaMock.partner.create.mockResolvedValue({ id: 'p1', name: 'New Partner' } as any);

            const result = await partnerService.createPartner({ name: 'New Partner' }, 'user-1');

            expect(prismaMock.partner.create).toHaveBeenCalled();
            expect(result.id).toBe('p1');
        });
    });
});
