"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseBatchExcel = parseBatchExcel;
const XLSX = __importStar(require("xlsx"));
// Helper to parse Google Ads ID format (xxx-xxx-xxxx)
const parseAccountId = (id) => {
    if (!id)
        return null;
    const cleaned = id.toString().replace(/[^\d-]/g, '');
    const match = cleaned.match(/(\d{3})-?(\d{3})-?(\d{4})/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
};
// Helper to parse status
const parseStatus = (status) => {
    const lower = status?.toLowerCase() || '';
    if (lower.includes('hoạt động') || lower.includes('active'))
        return 'ACTIVE';
    if (lower.includes('đang hoạt động'))
        return 'ACTIVE';
    if (lower.includes('không') || lower.includes('inactive') || lower.includes('suspended'))
        return 'SUSPENDED';
    if (lower.includes('chết') || lower.includes('died') || lower.includes('tắt'))
        return 'DIED';
    return 'ACTIVE';
};
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
function parseBatchExcel(buffer) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    // Extract date range from row 2
    const dateRange = data[1]?.[0]?.toString() || '';
    // Find header row (usually row 3, index 2)
    let headerRowIndex = 2;
    for (let i = 0; i < Math.min(5, data.length); i++) {
        const row = data[i];
        if (row && row.some((cell) => cell?.toString().includes('Tình trạng') ||
            cell?.toString().includes('Tên tài khoản'))) {
            headerRowIndex = i;
            break;
        }
    }
    const dataRows = data.slice(headerRowIndex + 1);
    // Extract batch info from first data row
    let batchName = '';
    let mccAccountId = '';
    for (const row of dataRows) {
        if (!row || row.length === 0)
            continue;
        const firstCell = row[0]?.toString() || '';
        if (firstCell.includes('Tổng số') || !firstCell)
            continue;
        // Column D (index 3): Tên người quản lý (Batch Name)
        if (!batchName && row[3]) {
            batchName = row[3].toString().trim();
        }
        // Column E (index 4): Mã khách hàng của người quản lý (MCC ID)
        if (!mccAccountId && row[4]) {
            const parsedMccId = parseAccountId(row[4].toString());
            if (parsedMccId) {
                mccAccountId = parsedMccId;
            }
        }
        if (batchName && mccAccountId)
            break;
    }
    // Parse all accounts
    const accounts = [];
    const seenAccountIds = new Set();
    for (const row of dataRows) {
        if (!row || row.length === 0)
            continue;
        const firstCell = row[0]?.toString() || '';
        if (firstCell.includes('Tổng số') || !firstCell)
            continue;
        // Column C (index 2): ID khách hàng bên ngoại (Account ID)
        const rawAccountId = row[2]?.toString();
        const googleAccountId = parseAccountId(rawAccountId);
        if (!googleAccountId || seenAccountIds.has(googleAccountId)) {
            continue;
        }
        seenAccountIds.add(googleAccountId);
        // Column A (index 0): Tình trạng (Status)
        const status = parseStatus(row[0]?.toString());
        // Column B (index 1): Tên tài khoản (Account Name)
        const accountName = row[1]?.toString()?.trim() || 'Unknown';
        // Column K (index 10): Mã đơn vị tiền tệ (Currency)
        let currency = 'USD';
        const currencyCell = row[10]?.toString() || '';
        if (currencyCell.includes('VND'))
            currency = 'VND';
        else if (currencyCell.includes('USD'))
            currency = 'USD';
        else if (currencyCell)
            currency = currencyCell.trim();
        // Column M (index 12): Chi phí (Spending)
        let spending = 0;
        const spendingCell = row[12]?.toString() || '';
        if (spendingCell) {
            // Parse spending: remove currency symbols, handle comma/dot as decimal
            const cleaned = spendingCell.replace(/[^\d,.-]/g, '').replace(/,/g, '.');
            spending = parseFloat(cleaned) || 0;
        }
        accounts.push({
            status,
            accountName,
            googleAccountId,
            currency,
            spending,
        });
    }
    return {
        batchName,
        mccAccountId,
        accounts,
        dateRange,
    };
}
exports.default = parseBatchExcel;
//# sourceMappingURL=excelParser.js.map