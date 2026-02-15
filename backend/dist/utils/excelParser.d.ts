export interface ParsedAccount {
    status: 'ACTIVE' | 'INACTIVE';
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
 */
export declare function parseBatchExcel(buffer: Buffer): ParsedBatchData;
export default parseBatchExcel;
