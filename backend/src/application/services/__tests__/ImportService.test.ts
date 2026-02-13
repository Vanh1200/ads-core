import { describe, it, expect, vi, beforeEach } from 'vitest';
import { importService } from '../ImportService';
import { accountRepository } from '../../../infrastructure/database/repositories/PrismaAccountRepository';
import { batchRepository } from '../../../infrastructure/database/repositories/PrismaBatchRepository';
import * as XLSX from 'xlsx';

vi.mock('../../../infrastructure/database/repositories/PrismaAccountRepository', () => ({
    accountRepository: {
        findById: vi.fn(),
        findByGoogleId: vi.fn(),
        create: vi.fn(),
    },
}));

vi.mock('../../../infrastructure/database/repositories/PrismaBatchRepository', () => ({
    batchRepository: {
        updateBatchCounts: vi.fn(),
    },
}));

vi.mock('xlsx', () => ({
    read: vi.fn(),
    utils: {
        sheet_to_json: vi.fn(),
    },
}));

describe('ImportService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('importAccounts', () => {
        it('should parse Excel rows and create accounts', async () => {
            const mockData = [
                ['Tên tài khoản', 'ID khách hàng', 'Tình trạng', 'Tiền tệ'],
                ['Account 1', '123-456-7890', 'Hoạt động', 'USD'],
            ];

            (XLSX.read as any).mockReturnValue({ SheetNames: ['Sheet1'], Sheets: { Sheet1: {} } });
            (XLSX.utils.sheet_to_json as any).mockReturnValue(mockData);

            vi.mocked(accountRepository.findByGoogleId).mockResolvedValue(null);

            const result = await importService.importAccounts(Buffer.from(''), 'batch-1', 'user-1');

            expect(accountRepository.create).toHaveBeenCalledWith(expect.objectContaining({
                googleAccountId: '123-456-7890',
                accountName: 'Account 1',
                status: 'ACTIVE',
            }));
            expect(result.results.created).toBe(1);
        });
    });

    describe('parseBatch', () => {
        it('should parse data and mark existing accounts', async () => {
            const mockData = [
                ['Tên tài khoản', 'ID khách hàng', 'Tình trạng', 'Tiền tệ'],
                ['A1', '111-222-3333', 'Hoạt động', 'USD'],
                ['A2', '444-555-6666', 'Active', 'USD'],
            ];

            (XLSX.read as any).mockReturnValue({ SheetNames: ['Sheet1'], Sheets: { Sheet1: {} } });
            (XLSX.utils.sheet_to_json as any).mockReturnValue(mockData);

            vi.mocked(accountRepository.findByGoogleId)
                .mockResolvedValueOnce({ id: 'existing' } as any)
                .mockResolvedValueOnce(null);

            const result = await importService.parseBatch(Buffer.from(''));

            expect(result.accounts[0].existsInDb).toBe(true);
            expect(result.accounts[1].existsInDb).toBe(false);
            expect(result.summary.new).toBe(1);
        });
    });
});
