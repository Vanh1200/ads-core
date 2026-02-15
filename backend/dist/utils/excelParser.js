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
    if (lower.includes('hoạt động') || lower.includes('active') || lower.includes('đang hoạt động'))
        return 'ACTIVE';
    if (lower.includes('không') ||
        lower.includes('inactive') ||
        lower.includes('suspended') ||
        lower.includes('chết') ||
        lower.includes('died') ||
        lower.includes('tắt') ||
        lower.includes('tạm dừng') ||
        lower.includes('paused') ||
        lower.includes('vô hiệu hóa') ||
        lower.includes('disabled'))
        return 'INACTIVE';
    return 'ACTIVE';
};
/**
 * Parse Excel file to extract batch info and accounts
 */
function parseBatchExcel(buffer) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    // Extract date range from row 2
    const dateRange = data[1]?.[0]?.toString() || '';
    // Keywords mapping
    const keywords = {
        status: ['tình trạng', 'status'],
        accountName: ['tên tài khoản', 'account name', 'account'],
        googleAccountId: ['id khách hàng bên ngoài', 'customer id', 'mã khách hàng'],
        batchName: ['tên người quản lý', 'manager name', 'tên người quản lý trực tiếp'],
        mccAccountId: ['mã khách hàng của người quản lý', 'manager customer id', 'mã khách hàng của người quản lý trực tiếp'],
        currency: ['mã đơn vị tiền tệ', 'currency'],
        spending: ['chi phi', 'chi phí', 'cost', 'spending'] // Note: "chi phi" without accent for safety
    };
    // Auto-detect header row and column indices
    let headerRowIndex = -1;
    const indices = {
        status: 0,
        accountName: 1,
        googleAccountId: 2,
        batchName: 3,
        mccAccountId: 4,
        currency: 10,
        spending: 12
    };
    // Scan first 10 rows for headers
    for (let i = 0; i < Math.min(10, data.length); i++) {
        const row = data[i];
        if (!row)
            continue;
        let foundKeywordsInRow = 0;
        const tempIndices = {};
        row.forEach((cell, cellIndex) => {
            if (!cell)
                return;
            const cellText = cell.toString().toLowerCase();
            for (const [key, searchTerms] of Object.entries(keywords)) {
                if (searchTerms.some(term => cellText.includes(term.toLowerCase()))) {
                    tempIndices[key] = cellIndex;
                    foundKeywordsInRow++;
                    break;
                }
            }
        });
        // If we found at least 3 key columns, assume this is the header row
        if (foundKeywordsInRow >= 3) {
            headerRowIndex = i;
            // Merge found indices with defaults
            Object.assign(indices, tempIndices);
            break;
        }
    }
    if (headerRowIndex === -1) {
        // Fallback or throw error? For now, assume row 3 as fallback index 2
        headerRowIndex = 2;
    }
    const dataRows = data.slice(headerRowIndex + 1);
    // Extract batch info
    let batchName = '';
    let mccAccountId = '';
    for (const row of dataRows) {
        if (!row || row.length === 0)
            continue;
        const firstCell = row[0]?.toString() || '';
        if (firstCell.includes('Tổng số') || !firstCell)
            continue;
        if (!batchName && row[indices.batchName]) {
            batchName = row[indices.batchName].toString().trim();
        }
        if (!mccAccountId && row[indices.mccAccountId]) {
            const parsedMccId = parseAccountId(row[indices.mccAccountId].toString());
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
        // Skip summary rows
        if (firstCell.toLowerCase().includes('tổng số') ||
            firstCell.toLowerCase().includes('total') ||
            !row[indices.googleAccountId])
            continue;
        const googleAccountId = parseAccountId(row[indices.googleAccountId]?.toString());
        if (!googleAccountId || seenAccountIds.has(googleAccountId)) {
            continue;
        }
        seenAccountIds.add(googleAccountId);
        const status = parseStatus(row[indices.status]?.toString());
        const accountName = row[indices.accountName]?.toString()?.trim() || 'Unknown';
        // Detect currency
        let currency = 'USD';
        const currencyCell = row[indices.currency]?.toString() || '';
        if (currencyCell.includes('VND'))
            currency = 'VND';
        else if (currencyCell.includes('USD'))
            currency = 'USD';
        else if (currencyCell)
            currency = currencyCell.trim();
        // Parse spending
        let spending = 0;
        const spendingCell = row[indices.spending]?.toString() || '';
        if (spendingCell) {
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