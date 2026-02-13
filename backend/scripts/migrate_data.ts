import { PrismaClient, AccountStatus, BatchStatus, InvoiceMCCStatus, CreditStatus, CustomerStatus } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as path from 'path';

const prisma = new PrismaClient();
const filePath = path.join(__dirname, '../../MCC manager.xlsx');

async function migrate() {
    try {
        console.log('--- STARTING REFINED HIGH-SPEED MIGRATION (ACCURATE 2026) ---');

        const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
        if (!admin) throw new Error('Admin not found. Run seed first.');

        let partner = await prisma.partner.findFirst({ where: { name: 'General Partner' } });
        if (!partner) {
            partner = await prisma.partner.create({ data: { name: 'General Partner', type: 'BOTH' } });
        }

        const workbook = XLSX.readFile(filePath);

        const allBatches = new Map<string, any>();
        const allInvoices = new Map<string, any>();
        const allCustomers = new Map<string, any>();
        const allAccounts = new Map<string, any>();
        const allSpending: any[] = [];

        console.log('Step 1: Parsing Excel sheets...');
        for (const sheetName of workbook.SheetNames) {
            if (!sheetName.startsWith('MA')) continue;
            const sheet = workbook.Sheets[sheetName];
            const rows: any[] = XLSX.utils.sheet_to_json(sheet);

            for (const row of rows) {
                const accID = row['ID tài khoản'] ? String(row['ID tài khoản']).trim() : null;
                if (!accID) continue;

                const batchID = row['ID MCC tài khoản'] ? String(row['ID MCC tài khoản']).trim() : 'N/A';
                if (!allBatches.has(batchID)) {
                    allBatches.set(batchID, {
                        mccAccountName: String(row['Tên MCC tài khoản'] || 'Default Batch'),
                        mccAccountId: batchID,
                        status: BatchStatus.ACTIVE,
                        createdById: admin.id,
                        partnerId: partner.id
                    });
                }

                const miID = row['ID MCC Invoice'] ? String(row['ID MCC Invoice']).trim() : null;
                if (miID && !allInvoices.has(miID)) {
                    allInvoices.set(miID, {
                        name: String(row['Tên MCC Invoice'] || 'Unknown MI'),
                        mccInvoiceId: miID,
                        status: InvoiceMCCStatus.ACTIVE,
                        creditStatus: row['Trạng thái đi tín'] === 'Yes' ? CreditStatus.CONNECTED : CreditStatus.PENDING,
                        createdById: admin.id,
                        partnerId: partner.id
                    });
                }

                const mcName = row['Tên khách hàng'] ? String(row['Tên khách hàng']).trim() : null;
                if (mcName && !allCustomers.has(mcName)) {
                    allCustomers.set(mcName, {
                        name: mcName,
                        status: CustomerStatus.ACTIVE
                    });
                }

                if (!allAccounts.has(accID)) {
                    allAccounts.set(accID, {
                        googleAccountId: accID,
                        accountName: row['Tên tài khoản'] ? String(row['Tên tài khoản']).trim() : 'Unnamed Account',
                        status: row['Tình Trạng hoạt động'] === 'Đang hoạt động' ? AccountStatus.ACTIVE : AccountStatus.SUSPENDED,
                        currency: row['Đơn vị tiền tệ'] ? String(row['Đơn vị tiền tệ']).trim() : 'USD',
                        _batchID: batchID,
                        _miID: miID,
                        _mcName: mcName
                    });
                }

                for (const [key, value] of Object.entries(row)) {
                    if (key && typeof key === 'string' && key.includes('/') && !isNaN(Number(value)) && Number(value) >= 0) {
                        const [day, month] = key.split('/').map(Number);
                        const spendingDate = new Date(2026, month - 1, day);
                        allSpending.push({
                            _accID: accID,
                            spendingDate,
                            amount: Number(value),
                            _miID: miID,
                            _mcName: mcName
                        });
                    }
                }
            }
        }

        console.log(`Step 2: Processing Metadata (Batches: ${allBatches.size}, Invoices: ${allInvoices.size}, Customers: ${allCustomers.size})`);

        const batchMap = new Map();
        for (const [id, data] of allBatches) {
            const b = await prisma.accountBatch.upsert({ where: { mccAccountId: id }, update: {}, create: data });
            batchMap.set(id, b.id);
        }
        const invoiceMap = new Map();
        for (const [id, data] of allInvoices) {
            const i = await prisma.invoiceMCC.upsert({ where: { mccInvoiceId: id }, update: {}, create: data });
            invoiceMap.set(id, i.id);
        }
        const customerMap = new Map();
        for (const [name, data] of allCustomers) {
            const c = await prisma.customer.upsert({ where: { name: name }, update: {}, create: data });
            customerMap.set(name, c.id);
        }

        console.log('Step 3: Bulk Creating Accounts...');
        const accountsList = Array.from(allAccounts.values()).map(acc => ({
            googleAccountId: acc.googleAccountId,
            accountName: acc.accountName,
            status: acc.status,
            currency: acc.currency,
            batchId: batchMap.get(acc._batchID),
            currentMiId: invoiceMap.get(acc._miID) || null,
            currentMcId: customerMap.get(acc._mcName) || null,
        }));

        await prisma.account.createMany({ data: accountsList, skipDuplicates: true });

        console.log('Step 4: Bulk Creating Spending Records...');
        const dbAccounts = await prisma.account.findMany({ select: { id: true, googleAccountId: true } });
        const accIdMap = new Map(dbAccounts.map(a => [a.googleAccountId, a.id]));

        const spendingReady = allSpending.map(s => {
            const accountId = accIdMap.get(s._accID);
            if (!accountId) return null;
            return {
                accountId,
                spendingDate: s.spendingDate,
                amount: s.amount,
                periodStart: s.spendingDate,
                periodEnd: s.spendingDate,
                invoiceMccId: invoiceMap.get(s._miID) || null,
                customerId: customerMap.get(s._mcName) || null,
            };
        }).filter((s): s is any => s !== null);

        const CHUNK_SIZE = 5000;
        for (let i = 0; i < spendingReady.length; i += CHUNK_SIZE) {
            await prisma.spendingRecord.createMany({
                data: spendingReady.slice(i, i + CHUNK_SIZE),
                skipDuplicates: true
            });
            process.stdout.write(`+`);
        }

        console.log('\nStep 5: Refreshing Aggregations (High Performance SQL)...');

        // Update Account totalSpending
        await prisma.$executeRaw`
            UPDATE accounts a
            SET total_spending = s.total
            FROM (
                SELECT account_id, SUM(amount) as total
                FROM spending_records
                GROUP BY account_id
            ) s
            WHERE a.id = s.account_id;
        `;

        // Update Customer stats
        await prisma.$executeRaw`
            UPDATE customers c
            SET 
                total_spending = s.total,
                total_accounts = s.count,
                active_accounts = s.active_count
            FROM (
                SELECT 
                    current_mc_id, 
                    SUM(total_spending) as total,
                    COUNT(*) as count,
                    COUNT(*) FILTER (WHERE status = 'ACTIVE') as active_count
                FROM accounts
                WHERE current_mc_id IS NOT NULL
                GROUP BY current_mc_id
            ) s
            WHERE c.id = s.current_mc_id;
        `;

        // Update Batch stats
        await prisma.$executeRaw`
            UPDATE account_batches b
            SET 
                total_accounts = s.count,
                live_accounts = s.active_count
            FROM (
                SELECT 
                    batch_id, 
                    COUNT(*) as count,
                    COUNT(*) FILTER (WHERE status = 'ACTIVE') as active_count
                FROM accounts
                GROUP BY batch_id
            ) s
            WHERE b.id = s.batch_id;
        `;

        // Update Invoice stats
        await prisma.$executeRaw`
            UPDATE invoice_mccs i
            SET 
                linked_accounts_count = s.count,
                active_accounts_count = s.active_count
            FROM (
                SELECT 
                    current_mi_id, 
                    COUNT(*) as count,
                    COUNT(*) FILTER (WHERE status = 'ACTIVE') as active_count
                FROM accounts
                WHERE current_mi_id IS NOT NULL
                GROUP BY current_mi_id
            ) s
            WHERE i.id = s.current_mi_id;
        `;

        console.log(`--- MIGRATION COMPLETE ---`);
    } catch (error: any) {
        console.error('Migration failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

migrate();
