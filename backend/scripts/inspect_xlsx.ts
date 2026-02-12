import * as XLSX from 'xlsx';
import * as path from 'path';

const filePath = path.join(__dirname, '../../MCC manager.xlsx');

async function inspect() {
    try {
        const workbook = XLSX.readFile(filePath);
        const customers = new Set<string>();
        const invoices = new Set<string>();
        const batches = new Set<string>();

        workbook.SheetNames.forEach(name => {
            if (name.startsWith('MA')) {
                const sheet = workbook.Sheets[name];
                const data: any[] = XLSX.utils.sheet_to_json(sheet);

                data.forEach(row => {
                    if (row['Tên khách hàng']) customers.add(row['Tên khách hàng']);
                    if (row['ID MCC Invoice']) invoices.add(`${row['Tên MCC Invoice']} (${row['ID MCC Invoice']})`);
                    if (row['ID MCC tài khoản']) batches.add(`${row['Tên MCC tài khoản']} (${row['ID MCC tài khoản']})`);
                });
            }
        });

        console.log('\n--- Unique Batches (MA) ---');
        batches.forEach(b => console.log(b));

        console.log('\n--- Unique Customers (MC) ---');
        customers.forEach(c => console.log(c));

        console.log('\n--- Unique Invoices (MI) ---');
        invoices.forEach(i => console.log(i));

    } catch (error: any) {
        console.error('Error:', error.message);
    }
}

inspect();
