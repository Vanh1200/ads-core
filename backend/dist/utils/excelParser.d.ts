export interface ParsedAccount {
    status: 'ACTIVE' | 'INACTIVE' | 'DIED';
    accountName: string;
    googleAccountId: string;
    currency: string;
    spending: number;
}
export interface ParsedBatchData {
    batchName: string;
    mccAccountId: string;
    accounts: ParsedAccount[];
    dateRange: string;
}
/**
 * Parse Excel file to extract batch info and accounts
 *
 * Excel format:
 * Row 1: Title "Báo cáo hiệu suất"
 * Row 2: Date range "12 tháng 1, 2026 - 8 tháng 2, 2026"
 * Row 3: Headers
 * Row 4+: Account data
 *
 * Columns (0-indexed):
 * A (0): Tình trạng (Status)
 * B (1): Tên tài khoản (Account Name)
 * C (2): ID khách hàng bên ngoài (Account ID) → Google Ads Customer ID
 * D (3): Tên người quản lý (Manager Name) → Batch Name
 * E (4): Mã khách hàng của người quản lý (Manager ID) → MCC Account ID
 * K (10): Mã đơn vị tiền tệ (Currency)
 * M (12): Chi phí (Spending)
 */
export declare function parseBatchExcel(buffer: Buffer): ParsedBatchData;
export default parseBatchExcel;
