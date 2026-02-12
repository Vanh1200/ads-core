import { PrismaClient, AccountStatus, BatchStatus, InvoiceMCCStatus, CreditStatus, CustomerStatus } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as path from 'path';

const prisma = new PrismaClient();
const filePath = path.join(__dirname, '../../MCC manager.xlsx');

async function migrate() {
    try {
        console.log('--- STARTING MIGRATION ---');

        // 1. Get or Create Default Admin User
        let admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
        if (!admin) {
            console.log('Creating default admin user...');
            admin = await prisma.user.create({
                data: {
                    email: 'admin@ads-core.com',
                    passwordHash: 'migration_placeholder',
                    fullName: 'System Admin',
                    role: 'ADMIN',
                }
            });
        }

        // 2. Get or Create Default Partner
        let partner = await prisma.partner.findFirst({ where: { name: 'General Partner' } });
        if (!partner) {
            console.log('Creating general partner...');
            partner = await prisma.partner.create({
                data: {
                    name: 'General Partner',
                    type: 'BOTH',
                }
            });
        }

        const workbook = XLSX.readFile(filePath);
        let totalAccounts = 0;
        let totalSpending = 0;

        for (const sheetName of workbook.SheetNames) {
            if (!sheetName.startsWith('MA')) continue;

            console.log(`\nProcessing Sheet: ${sheetName}`);
            const sheet = workbook.Sheets[sheetName];
            const rows: any[] = XLSX.utils.sheet_to_json(sheet);

            for (const row of rows) {
                const accID = row['ID tài khoản'] ? String(row['ID tài khoản']).trim() : null;
                if (!accID) continue;

                // --- 1. Find or Create Batch (MA) ---
                const batchName = row['Tên MCC tài khoản'] || 'Default Batch';
                const batchID = row['ID MCC tài khoản'] ? String(row['ID MCC tài khoản']).trim() : 'N/A';

                const batch = await prisma.accountBatch.upsert({
                    where: { mccAccountId: batchID },
                    update: {},
                    create: {
                        mccAccountName: batchName,
                        mccAccountId: batchID,
                        status: BatchStatus.ACTIVE,
                        createdById: admin.id,
                        partnerId: partner.id
                    }
                });

                // --- 2. Find or Create Invoice (MI) ---
                let invoiceId = null;
                const miID = row['ID MCC Invoice'] ? String(row['ID MCC Invoice']).trim() : null;
                const miName = row['Tên MCC Invoice'] || 'Unknown MI';
                if (miID) {
                    const invoice = await prisma.invoiceMCC.upsert({
                        where: { mccInvoiceId: miID },
                        update: {},
                        create: {
                            name: miName,
                            mccInvoiceId: miID,
                            status: InvoiceMCCStatus.ACTIVE,
                            creditStatus: row['Trạng thái đi tín'] === 'Yes' ? CreditStatus.CONNECTED : CreditStatus.PENDING,
                            createdById: admin.id,
                            partnerId: partner.id
                        }
                    });
                    invoiceId = invoice.id;
                }

                // --- 3. Find or Create Customer (MC) ---
                let customerId = null;
                const mcName = row['Tên khách hàng'] ? String(row['Tên khách hàng']).trim() : null;
                if (mcName) {
                    const customer = await prisma.customer.upsert({
                        where: { name: mcName },
                        update: {},
                        create: {
                            name: mcName,
                            status: CustomerStatus.ACTIVE
                        }
                    });
                    customerId = customer.id;
                }

                // --- 4. Create Account ---
                const account = await prisma.account.upsert({
                    where: { googleAccountId: accID },
                    update: {
                        batchId: batch.id,
                        currentMiId: invoiceId,
                        currentMcId: customerId,
                        status: row['Tình Trạng hoạt động'] === 'Đang hoạt động' ? AccountStatus.ACTIVE : AccountStatus.SUSPENDED,
                    },
                    create: {
                        googleAccountId: accID,
                        accountName: row['Tên tài khoản'] ? String(row['Tên tài khoản']).trim() : 'Unnamed Account',
                        status: row['Tình Trạng hoạt động'] === 'Đang hoạt động' ? AccountStatus.ACTIVE : AccountStatus.SUSPENDED,
                        currency: row['Đơn vị tiền tệ'] ? String(row['Đơn vị tiền tệ']).trim() : 'USD',
                        batchId: batch.id,
                        currentMiId: invoiceId,
                        currentMcId: customerId,
                    }
                });

                totalAccounts++;

                // --- 5. Import Spending records ---
                // Date columns have keys like "22/01", "10/02" etc.
                for (const [key, value] of Object.entries(row)) {
                    if (key && typeof key === 'string' && key.includes('/') && !isNaN(Number(value)) && Number(value) >= 0) {
                        const [day, month] = key.split('/').map(Number);
                        const year = 2025; // Default year as per plan
                        const spendingDate = new Date(year, month - 1, day);

                        await prisma.spendingRecord.upsert({
                            where: {
                                accountId_spendingDate: { // Note: I need to check if I have a composite unique constraint
                                    accountId: account.id,
                                    spendingDate: spendingDate
                                }
                            },
                            update: { amount: Number(value) },
                            create: {
                                accountId: account.id,
                                spendingDate: spendingDate,
                                amount: Number(value),
                                periodStart: spendingDate,
                                periodEnd: spendingDate,
                                invoiceMccId: invoiceId,
                                customerId: customerId
                            }
                        });
                        totalSpending++;
                    }
                }
            }
        }

        console.log(`\n--- MIGRATION COMPLETE ---`);
        console.log(`Total Accounts Processed: ${totalAccounts}`);
        console.log(`Total Spending Records: ${totalSpending}`);

    } catch (error: any) {
        console.error('Migration failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

migrate();
