import { google } from 'googleapis';
import { prisma } from '../../config/database';
import { format } from 'date-fns';

export class GoogleSheetsService {
    private auth;
    private sheets;

    constructor() {
        // Initialize Google Auth using Service Account
        // Expects GOOGLE_SERVICE_ACCOUNT_KEY as a JSON string or path to JSON file
        const keyData = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
        
        if (!keyData) {
            console.warn('[GoogleSheetsService] GOOGLE_SERVICE_ACCOUNT_KEY not set. Google Sheets sync will be disabled.');
            this.auth = null;
            this.sheets = null;
            return;
        }

        try {
            const credentials = keyData.startsWith('{') ? JSON.parse(keyData) : JSON.parse(require('fs').readFileSync(keyData, 'utf8'));
            this.auth = new google.auth.GoogleAuth({
                credentials,
                scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            });
            this.sheets = google.sheets({ version: 'v4', auth: this.auth });
        } catch (error) {
            console.error('[GoogleSheetsService] Failed to initialize Google Auth:', error);
            this.auth = null;
            this.sheets = null;
        }
    }

    async updateCustomerSheet(customerId: string, date: Date, onProgress?: (msg: string) => void): Promise<void> {
        if (!this.sheets) {
            onProgress?.('⚠️ Google Sheets API không được cấu hình.');
            return;
        }

        const dateStr = format(date, 'dd/MM/yyyy');
        onProgress?.(`🔍 Đang lấy dữ liệu chi tiêu cho khách hàng (${customerId}) ngày ${dateStr}...`);

        const customer = await prisma.customer.findUnique({
            where: { id: customerId },
            include: {
                accounts: {
                    where: { status: 'ACTIVE' },
                    include: {
                        spendingRecords: {
                            where: {
                                spendingDate: {
                                    gte: new Date(date.setHours(0, 0, 0, 0)),
                                    lte: new Date(date.setHours(23, 59, 59, 999)),
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!customer || !customer.googleSheetId) {
            onProgress?.('❌ Không tìm thấy khách hàng hoặc Google Sheet ID.');
            return;
        }

        const spreadsheetId = customer.googleSheetId;
        onProgress?.(`📂 Đang mở Google Sheet: ${spreadsheetId}...`);

        try {
            // 1. Get spreadsheet metadata to find the sheet name
            const spreadsheet = await this.sheets.spreadsheets.get({ spreadsheetId });
            const sheetName = spreadsheet.data.sheets?.[0]?.properties?.title || 'Sheet1';

            // 2. Read existing data to find date column and account rows
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `${sheetName}!A1:ZZ1000`, // Adjust range as needed
            });

            const rows = response.data.values || [];
            if (rows.length === 0) {
                // Initialize sheet if empty
                onProgress?.('📝 Sheet trống. Đang tạo tiêu đề...');
                const headers = ['ID Tài khoản', 'Tên tài khoản', dateStr];
                await this.sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: `${sheetName}!A1`,
                    valueInputOption: 'RAW',
                    requestBody: { values: [headers] },
                });
                // Re-read
                return this.updateCustomerSheet(customerId, date, onProgress);
            }

            const headerRow = rows[0];
            let dateColIndex = headerRow.indexOf(dateStr);

            // If date column not found, add it
            if (dateColIndex === -1) {
                onProgress?.(`📅 Thêm cột ngày ${dateStr}...`);
                dateColIndex = headerRow.length;
                const colLetter = this.getColLetter(dateColIndex);
                await this.sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: `${sheetName}!${colLetter}1`,
                    valueInputOption: 'RAW',
                    requestBody: { values: [[dateStr]] },
                });
            }

            // 3. Update or Append account rows
            const idColIndex = 0; // Assume ID is in first column
            const nameColIndex = 1;

            for (const account of customer.accounts) {
                const amount = account.spendingRecords.reduce((sum, r) => sum + Number(r.amount), 0);
                const accountId = account.googleAccountId;
                
                onProgress?.(`🔄 Cập nhật tài khoản ${accountId}: ${amount.toLocaleString()}đ`);

                let accountRowIndex = rows.findIndex(row => row[idColIndex] === accountId);
                
                if (accountRowIndex === -1) {
                    // Append new row
                    onProgress?.(`➕ Thêm tài khoản mới ${accountId} vào sheet.`);
                    const newRow = new Array(dateColIndex + 1).fill('');
                    newRow[idColIndex] = accountId;
                    newRow[nameColIndex] = account.accountName;
                    newRow[dateColIndex] = amount;
                    
                    await this.sheets.spreadsheets.values.append({
                        spreadsheetId,
                        range: `${sheetName}!A:A`,
                        valueInputOption: 'RAW',
                        requestBody: { values: [newRow] },
                    });
                } else {
                    // Update existing cell
                    const cellRange = `${sheetName}!${this.getColLetter(dateColIndex)}${accountRowIndex + 1}`;
                    await this.sheets.spreadsheets.values.update({
                        spreadsheetId,
                        range: cellRange,
                        valueInputOption: 'RAW',
                        requestBody: { values: [[amount]] },
                    });
                }
            }

            onProgress?.(`✅ Hoàn thành cập nhật cho khách hàng ${customer.name}.`);
        } catch (error: any) {
            console.error(`[GoogleSheetsService] Error updating sheet ${spreadsheetId}:`, error);
            onProgress?.(`💥 Lỗi: ${error.message}`);
            throw error;
        }
    }

    private getColLetter(index: number): string {
        let letter = '';
        while (index >= 0) {
            letter = String.fromCharCode((index % 26) + 65) + letter;
            index = Math.floor(index / 26) - 1;
        }
        return letter;
    }
}

export const googleSheetsService = new GoogleSheetsService();
