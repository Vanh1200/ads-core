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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const XLSX = __importStar(require("xlsx"));
const database_1 = __importDefault(require("../config/database"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const activityLogger_1 = __importDefault(require("../utils/activityLogger"));
const router = (0, express_1.Router)();
// Configure multer for file uploads
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            file.mimetype === 'application/vnd.ms-excel' ||
            file.originalname.endsWith('.xlsx') ||
            file.originalname.endsWith('.xls')) {
            cb(null, true);
        }
        else {
            cb(new Error('Only Excel files are allowed'));
        }
    },
});
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
// POST /api/import/accounts - Import accounts from Excel
router.post('/accounts', auth_middleware_1.authenticateToken, auth_middleware_1.isBuyer, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }
        const { batchId } = req.body;
        if (!batchId) {
            res.status(400).json({ error: 'Batch ID is required' });
            return;
        }
        const batch = await database_1.default.accountBatch.findUnique({ where: { id: batchId } });
        if (!batch) {
            res.status(404).json({ error: 'Batch not found' });
            return;
        }
        // Parse Excel file
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        // Find header row (usually row 3, index 2)
        let headerRowIndex = 2;
        for (let i = 0; i < Math.min(5, data.length); i++) {
            const row = data[i];
            if (row && row.some((cell) => cell?.toString().includes('Tình trạng') ||
                cell?.toString().includes('Tên tài khoản') ||
                cell?.toString().includes('Account'))) {
                headerRowIndex = i;
                break;
            }
        }
        const headers = data[headerRowIndex] || [];
        const dataRows = data.slice(headerRowIndex + 1);
        // Find column indices
        const colMap = {};
        headers.forEach((header, index) => {
            const h = header?.toString().toLowerCase() || '';
            if (h.includes('tình trạng') || h.includes('status'))
                colMap.status = index;
            if (h.includes('tên tài khoản') || h.includes('account name'))
                colMap.accountName = index;
            if (h.includes('id') && (h.includes('khách hàng') || h.includes('account')))
                colMap.accountId = index;
            if (h.includes('tiền tệ') || h.includes('currency'))
                colMap.currency = index;
            if (h.includes('chi phí') || h.includes('cost') || h.includes('spend'))
                colMap.spending = index;
        });
        const results = {
            created: 0,
            updated: 0,
            skipped: 0,
            errors: [],
        };
        for (const row of dataRows) {
            try {
                // Skip empty or summary rows
                if (!row || row.length === 0)
                    continue;
                const firstCell = row[0]?.toString() || '';
                if (firstCell.includes('Tổng số') || !firstCell)
                    continue;
                const rawAccountId = row[colMap.accountId || 2]?.toString();
                const googleAccountId = parseAccountId(rawAccountId);
                if (!googleAccountId) {
                    results.skipped++;
                    continue;
                }
                const accountName = row[colMap.accountName || 1]?.toString() || 'Unknown';
                const status = parseStatus(row[colMap.status || 0]?.toString());
                const currency = row[colMap.currency]?.toString() || 'USD';
                // Check if account exists
                const existing = await database_1.default.account.findUnique({
                    where: { googleAccountId },
                });
                if (existing) {
                    // Update existing account
                    await database_1.default.account.update({
                        where: { id: existing.id },
                        data: { accountName, status: status },
                    });
                    results.updated++;
                }
                else {
                    // Create new account
                    await database_1.default.account.create({
                        data: {
                            googleAccountId,
                            accountName,
                            status: status,
                            currency,
                            batchId,
                            mccAccountName: batch.mccAccountName,
                            mccAccountId: batch.mccAccountId,
                        },
                    });
                    results.created++;
                }
            }
            catch (error) {
                results.errors.push(error.message);
            }
        }
        // Update batch counts
        const accountCounts = await database_1.default.account.groupBy({
            by: ['status'],
            where: { batchId },
            _count: true,
        });
        const totalAccounts = accountCounts.reduce((sum, c) => sum + c._count, 0);
        const liveAccounts = accountCounts.find((c) => c.status === 'ACTIVE')?._count || 0;
        await database_1.default.accountBatch.update({
            where: { id: batchId },
            data: { totalAccounts, liveAccounts },
        });
        await (0, activityLogger_1.default)({
            userId: req.user.id,
            action: 'IMPORT',
            entityType: 'AccountBatch',
            entityId: batchId,
            newValues: results,
            description: `Import tài khoản vào Lô ${batch.mccAccountName}: ${results.created} tạo mới, ${results.updated} cập nhật`,
            ipAddress: req.ip,
        });
        res.json({
            message: 'Import completed',
            results,
        });
    }
    catch (error) {
        console.error('Import accounts error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/import/parse-batch - Parse Excel file to preview batch data (no DB save)
const excelParser_1 = __importDefault(require("../utils/excelParser"));
router.post('/parse-batch', auth_middleware_1.authenticateToken, auth_middleware_1.isBuyer, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }
        const parsed = (0, excelParser_1.default)(req.file.buffer);
        // Check for existing accounts in DB
        const existingAccounts = await database_1.default.account.findMany({
            where: {
                googleAccountId: { in: parsed.accounts.map(a => a.googleAccountId) }
            },
            select: { googleAccountId: true, id: true, batchId: true }
        });
        const existingMap = new Map(existingAccounts.map(a => [a.googleAccountId, a]));
        const accountsWithStatus = parsed.accounts.map(account => ({
            ...account,
            existsInDb: existingMap.has(account.googleAccountId),
            existingBatchId: existingMap.get(account.googleAccountId)?.batchId || null,
        }));
        res.json({
            mccAccountId: parsed.mccAccountId,
            mccAccountName: parsed.batchName, // Use batchName from parser as mccAccountName
            dateRange: parsed.dateRange,
            accounts: accountsWithStatus,
            summary: {
                total: parsed.accounts.length,
                active: parsed.accounts.filter(a => a.status === 'ACTIVE').length,
                suspended: parsed.accounts.filter(a => a.status === 'INACTIVE').length,
                existing: existingAccounts.length,
                new: parsed.accounts.length - existingAccounts.length,
            },
        });
    }
    catch (error) {
        console.error('Parse batch error:', error);
        res.status(500).json({ error: 'Failed to parse Excel file' });
    }
});
// POST /api/import/create-batch-with-accounts - Create batch and accounts from confirmed data
router.post('/create-batch-with-accounts', auth_middleware_1.authenticateToken, auth_middleware_1.isBuyer, async (req, res) => {
    try {
        const { mccAccountId, mccAccountName, timezone, year, readiness, accounts } = req.body;
        if (!mccAccountName || !accounts || !Array.isArray(accounts)) {
            res.status(400).json({ error: 'Missing required fields: mccAccountName, accounts' });
            return;
        }
        // Create batch
        const batch = await database_1.default.accountBatch.create({
            data: {
                mccAccountId: mccAccountId || null,
                mccAccountName: mccAccountName || null,
                timezone: timezone || null,
                year: year ? parseInt(year.toString()) : null,
                readiness: readiness ? parseInt(readiness.toString()) : 0,
                status: 'ACTIVE',
                createdById: req.user.id,
            }
        });
        const results = {
            created: 0,
            updated: 0,
            skipped: 0,
            errors: [],
        };
        // Create/update accounts
        for (const account of accounts) {
            try {
                const { googleAccountId, accountName, status, currency } = account;
                if (!googleAccountId) {
                    results.skipped++;
                    continue;
                }
                const existing = await database_1.default.account.findUnique({
                    where: { googleAccountId }
                });
                if (existing) {
                    await database_1.default.account.update({
                        where: { id: existing.id },
                        data: {
                            accountName,
                            status,
                            batchId: batch.id,
                            mccAccountName: mccAccountName || null,
                            mccAccountId: mccAccountId || null,
                        }
                    });
                    results.updated++;
                }
                else {
                    await database_1.default.account.create({
                        data: {
                            googleAccountId,
                            accountName,
                            status,
                            currency: currency || 'USD',
                            batchId: batch.id,
                            mccAccountName: mccAccountName || null,
                            mccAccountId: mccAccountId || null,
                        }
                    });
                    results.created++;
                }
            }
            catch (error) {
                results.errors.push(error.message);
            }
        }
        // Update batch counts
        const accountCounts = await database_1.default.account.groupBy({
            by: ['status'],
            where: { batchId: batch.id },
            _count: true,
        });
        const totalAccounts = accountCounts.reduce((sum, c) => sum + c._count, 0);
        const liveAccounts = accountCounts.find((c) => c.status === 'ACTIVE')?._count || 0;
        await database_1.default.accountBatch.update({
            where: { id: batch.id },
            data: { totalAccounts, liveAccounts },
        });
        await (0, activityLogger_1.default)({
            userId: req.user.id,
            action: 'CREATE',
            entityType: 'AccountBatch',
            entityId: batch.id,
            newValues: { mccAccountName, accountsCreated: results.created, accountsUpdated: results.updated },
            description: `Tạo Lô "${mccAccountName}" với ${results.created + results.updated} tài khoản`,
            ipAddress: req.ip,
        });
        res.json({
            message: 'Batch created successfully',
            batch: {
                id: batch.id,
                mccAccountId: batch.mccAccountId,
                mccAccountName: batch.mccAccountName,
                totalAccounts,
                liveAccounts,
            },
            results,
        });
    }
    catch (error) {
        console.error('Create batch with accounts error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/import/spending - Import spending from Excel
router.post('/spending', auth_middleware_1.authenticateToken, auth_middleware_1.isUpdater, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }
        // Parse Excel file
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        // Parse date from row 2 (e.g., "29 tháng 1, 2026 - 29 tháng 1, 2026")
        const dateRow = data[1]?.[0]?.toString() || '';
        const dateMatch = dateRow.match(/(\d+)\s+tháng\s+(\d+),?\s+(\d{4})/);
        let spendingDate = new Date();
        if (dateMatch) {
            const [, day, month, year] = dateMatch;
            spendingDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        }
        // Find header row and data rows
        let headerRowIndex = 2;
        for (let i = 0; i < Math.min(5, data.length); i++) {
            const row = data[i];
            if (row && row.some((cell) => cell?.toString().includes('Tình trạng'))) {
                headerRowIndex = i;
                break;
            }
        }
        const headers = data[headerRowIndex] || [];
        const dataRows = data.slice(headerRowIndex + 1);
        // Find column indices
        const colMap = {};
        headers.forEach((header, index) => {
            const h = header?.toString().toLowerCase() || '';
            if (h.includes('id') && h.includes('khách hàng'))
                colMap.accountId = index;
            if (h.includes('chi phí') || h.includes('cost'))
                colMap.spending = index;
        });
        const results = {
            processed: 0,
            skipped: 0,
            errors: [],
        };
        for (const row of dataRows) {
            try {
                if (!row || row.length === 0)
                    continue;
                const firstCell = row[0]?.toString() || '';
                if (firstCell.includes('Tổng số') || !firstCell)
                    continue;
                const rawAccountId = row[colMap.accountId]?.toString();
                const googleAccountId = parseAccountId(rawAccountId);
                if (!googleAccountId) {
                    results.skipped++;
                    continue;
                }
                const spending = parseFloat(row[colMap.spending]?.toString().replace(',', '.') || '0');
                if (isNaN(spending) || spending === 0) {
                    results.skipped++;
                    continue;
                }
                // Find account
                const account = await database_1.default.account.findUnique({
                    where: { googleAccountId },
                    include: { currentMi: true, currentMc: true },
                });
                if (!account) {
                    results.skipped++;
                    continue;
                }
                // Create or update spending snapshot
                await database_1.default.spendingSnapshot.create({
                    data: {
                        accountId: account.id,
                        spendingDate,
                        cumulativeAmount: spending,
                        snapshotAt: new Date(),
                        snapshotType: 'DAILY_FINAL',
                        invoiceMccId: account.currentMiId,
                        customerId: account.currentMcId,
                        createdById: req.user.id,
                    },
                });
                results.processed++;
            }
            catch (error) {
                results.errors.push(error.message);
            }
        }
        await (0, activityLogger_1.default)({
            userId: req.user.id,
            action: 'IMPORT',
            entityType: 'SpendingSnapshot',
            entityId: 'bulk',
            newValues: { spendingDate, ...results },
            description: `Import chi tiêu ngày ${spendingDate.toISOString().split('T')[0]}: ${results.processed} bản ghi đã xử lý`,
            ipAddress: req.ip,
        });
        res.json({
            message: 'Spending import completed',
            spendingDate: spendingDate.toISOString().split('T')[0],
            results,
        });
    }
    catch (error) {
        console.error('Import spending error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Helper to parse spending data from Excel
const parseSpendingExcel = (buffer) => {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    // Find header row
    let headerRowIndex = 2;
    for (let i = 0; i < Math.min(5, data.length); i++) {
        const row = data[i];
        if (row && row.some((cell) => cell?.toString().includes('Tình trạng'))) {
            headerRowIndex = i;
            break;
        }
    }
    const headers = data[headerRowIndex] || [];
    const dataRows = data.slice(headerRowIndex + 1);
    // Find column indices
    const colMap = {};
    headers.forEach((header, index) => {
        const h = header?.toString().toLowerCase() || '';
        if (h.includes('id') && h.includes('khách hàng'))
            colMap.accountId = index;
        if (h.includes('chi phí') || h.includes('cost'))
            colMap.spending = index;
    });
    const items = [];
    for (const row of dataRows) {
        if (!row || row.length === 0)
            continue;
        const firstCell = row[0]?.toString() || '';
        if (firstCell.includes('Tổng số') || !firstCell)
            continue;
        const rawAccountId = row[colMap.accountId]?.toString();
        const googleAccountId = parseAccountId(rawAccountId);
        if (!googleAccountId)
            continue;
        const amount = parseFloat(row[colMap.spending]?.toString().replace(',', '.') || '0');
        if (isNaN(amount) || amount === 0)
            continue;
        items.push({ googleAccountId, amount });
    }
    return items;
};
// POST /api/import/spending/preview - Preview spending import using same format as batch creation
router.post('/spending/preview', auth_middleware_1.authenticateToken, auth_middleware_1.isUpdater, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }
        const { spendingDate, miId } = req.body;
        if (!spendingDate) {
            res.status(400).json({ error: 'Spending date is required' });
            return;
        }
        const date = new Date(spendingDate);
        // Use same parser as batch creation
        const parsed = (0, excelParser_1.default)(req.file.buffer);
        // Find or identify MI/Batch automatically from file
        let batch = null;
        let mi = null;
        if (miId) {
            mi = await database_1.default.invoiceMCC.findUnique({ where: { id: miId } });
            if (!mi) {
                res.status(404).json({ error: 'Invoice MCC (MI) không tồn tại' });
                return;
            }
        }
        else if (parsed.mccAccountId) {
            // Auto-detect MI by MCC ID from file
            mi = await database_1.default.invoiceMCC.findFirst({
                where: { mccInvoiceId: parsed.mccAccountId }
            });
        }
        // If still no MI, try to find Batch by name
        if (!mi) {
            batch = await database_1.default.accountBatch.findFirst({
                where: { mccAccountName: parsed.batchName },
            });
        }
        // Get all existing accounts
        let existingAccounts;
        if (mi) {
            existingAccounts = await database_1.default.account.findMany({
                where: { currentMiId: mi.id },
                include: { currentMi: true, currentMc: true },
            });
        }
        else if (batch) {
            existingAccounts = await database_1.default.account.findMany({
                where: { batchId: batch.id },
                include: { currentMi: true, currentMc: true },
            });
        }
        else {
            existingAccounts = await database_1.default.account.findMany({
                where: { googleAccountId: { in: parsed.accounts.map(a => a.googleAccountId) } },
                include: { currentMi: true, currentMc: true },
            });
        }
        const accountMap = new Map(existingAccounts.map(a => [a.googleAccountId, a]));
        // Check for existing spending records
        const existingRecords = await database_1.default.spendingRecord.findMany({
            where: {
                accountId: { in: existingAccounts.map(a => a.id) },
                spendingDate: date,
            },
            select: {
                accountId: true,
                amount: true,
            },
        });
        const existingSpendingMap = new Map(existingRecords.map(r => [r.accountId, r.amount]));
        const preview = [];
        let conflictCount = 0;
        let existingCount = 0;
        for (const item of parsed.accounts) {
            const existingAccount = accountMap.get(item.googleAccountId);
            // If importing by MI, only show accounts that belong to this MI or are NEW (if we want to allow auto-assigning to MI? No, better only existing accounts for that MI)
            // But the user might want to import spending for accounts that ARE in this MI.
            if (mi && !existingAccount)
                continue;
            const existingAmount = existingAccount ? existingSpendingMap.get(existingAccount.id) : undefined;
            const hasExisting = existingAmount !== undefined;
            const hasConflict = hasExisting && Number(existingAmount) !== item.spending;
            if (hasConflict)
                conflictCount++;
            if (hasExisting)
                existingCount++;
            preview.push({
                googleAccountId: item.googleAccountId,
                accountName: item.accountName,
                status: existingAccount?.status || 'NEW',
                newStatus: item.status,
                newAmount: item.spending,
                existingAmount: hasExisting ? Number(existingAmount) : null,
                hasConflict,
                hasExisting,
                isNewAccount: !existingAccount,
                accountId: existingAccount?.id || null,
                miName: existingAccount?.currentMi?.name || (mi?.name || null),
                mcName: existingAccount?.currentMc?.name || null,
            });
        }
        res.json({
            spendingDate: date.toISOString().split('T')[0],
            batchName: batch?.mccAccountName || parsed.batchName,
            batchId: batch?.id || null,
            miId: mi?.id || null,
            miName: mi?.name || null,
            dateRange: parsed.dateRange,
            totalItems: preview.length,
            conflictCount,
            existingCount,
            hasConflicts: conflictCount > 0,
            hasExisting: existingCount > 0,
            newAccounts: preview.filter(p => p.isNewAccount).length,
            existingAccounts: preview.filter(p => !p.isNewAccount).length,
            data: preview,
        });
    }
    catch (error) {
        console.error('Preview spending error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/import/spending/confirm - Confirm spending import with account status updates
router.post('/spending/confirm', auth_middleware_1.authenticateToken, auth_middleware_1.isUpdater, async (req, res) => {
    try {
        const { spendingDate, batchId, miId, data, overwrite } = req.body;
        if (!spendingDate || !data || !Array.isArray(data)) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }
        const date = new Date(spendingDate);
        const results = {
            accountsCreated: 0,
            accountsUpdated: 0,
            spendingCreated: 0,
            spendingUpdated: 0,
            skipped: 0,
        };
        // Get or verify batch
        let batch = batchId ? await database_1.default.accountBatch.findUnique({ where: { id: batchId } }) : null;
        for (const item of data) {
            const { googleAccountId, accountName, newStatus, newAmount, existingAmount, accountId } = item;
            // Skip existing records if not overwriting
            if (existingAmount !== null && !overwrite) {
                results.skipped++;
                continue;
            }
            let account;
            if (accountId) {
                // Update existing account status
                account = await database_1.default.account.update({
                    where: { id: accountId },
                    data: {
                        status: newStatus,
                        accountName,
                        lastSynced: new Date(),
                    },
                });
                results.accountsUpdated++;
            }
            else if (batch) {
                // Create new account if batch exists
                account = await database_1.default.account.create({
                    data: {
                        googleAccountId,
                        accountName,
                        status: newStatus,
                        currency: 'USD',
                        batchId: batch.id,
                        mccAccountId: batch.mccAccountId,
                        mccAccountName: batch.mccAccountName,
                    },
                });
                results.accountsCreated++;
            }
            else {
                results.skipped++;
                continue;
            }
            // Handle spending record
            // Calculate allocated amount for current MI/MC
            // Google Ads report gives total for the day. We need to subtract what was already recorded for *other* MI/MCs if any.
            const dayRecords = await database_1.default.spendingRecord.findMany({
                where: { accountId: account.id, spendingDate: date },
            });
            const otherRecords = dayRecords.filter(r => r.invoiceMccId !== account.currentMiId || r.customerId !== account.currentMcId);
            const otherAmount = otherRecords.reduce((sum, r) => sum + Number(r.amount), 0);
            // New amount for THIS specific MI/MC pair = Total Daily Spend - (Sum of OTHER pairs)
            const allocatedAmount = newAmount - otherAmount;
            const currentRecord = dayRecords.find(r => r.invoiceMccId === account.currentMiId && r.customerId === account.currentMcId);
            if (currentRecord) {
                if (overwrite) {
                    await database_1.default.spendingRecord.update({
                        where: { id: currentRecord.id },
                        data: { amount: allocatedAmount },
                    });
                    results.spendingUpdated++;
                }
                else {
                    // Skip if exists and no overwrite
                    results.skipped++;
                    continue;
                }
            }
            else {
                await database_1.default.spendingRecord.create({
                    data: {
                        accountId: account.id,
                        spendingDate: date,
                        amount: allocatedAmount,
                        currency: account.currency,
                        invoiceMccId: account.currentMiId,
                        customerId: account.currentMcId,
                        periodStart: date,
                        periodEnd: date,
                    },
                });
                results.spendingCreated++;
            }
            // Log activity for this specific account
            await (0, activityLogger_1.default)({
                userId: req.user.id,
                action: 'IMPORT_SPENDING',
                entityType: 'Account',
                entityId: account.id,
                description: `Import chi tiêu ngày ${date.toISOString().split('T')[0]}: $${allocatedAmount}`,
                ipAddress: req.ip,
            });
            // Update account total spending
            const totalSpending = await database_1.default.spendingRecord.aggregate({
                where: { accountId: account.id },
                _sum: { amount: true },
            });
            await database_1.default.account.update({
                where: { id: account.id },
                data: {
                    totalSpending: totalSpending._sum.amount || 0,
                },
            });
            // Update Customer total spending if assigned
            if (account.currentMcId) {
                const customerTotal = await database_1.default.spendingRecord.aggregate({
                    where: { customerId: account.currentMcId },
                    _sum: { amount: true },
                });
                await database_1.default.customer.update({
                    where: { id: account.currentMcId },
                    data: {
                        totalSpending: customerTotal._sum.amount || 0,
                    },
                });
            }
        }
        // Update batch counts if batch exists
        if (batch) {
            const accountCounts = await database_1.default.account.groupBy({
                by: ['status'],
                where: { batchId: batch.id },
                _count: true,
            });
            const totalAccounts = accountCounts.reduce((sum, c) => sum + c._count, 0);
            const liveAccounts = accountCounts.find((c) => c.status === 'ACTIVE')?._count || 0;
            await database_1.default.accountBatch.update({
                where: { id: batch.id },
                data: { totalAccounts, liveAccounts },
            });
        }
        await (0, activityLogger_1.default)({
            userId: req.user.id,
            action: 'IMPORT',
            entityType: 'SpendingRecord',
            entityId: 'bulk',
            newValues: { spendingDate: date.toISOString().split('T')[0], ...results },
            description: `Import chi tiêu: ${results.spendingCreated} tạo mới, ${results.spendingUpdated} cập nhật, ${results.accountsUpdated} tài khoản cập nhật`,
            ipAddress: req.ip,
        });
        res.json({
            message: 'Spending import completed',
            spendingDate: date.toISOString().split('T')[0],
            results,
        });
    }
    catch (error) {
        console.error('Confirm spending error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
//# sourceMappingURL=import.routes.js.map