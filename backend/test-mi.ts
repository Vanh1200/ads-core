import { PrismaClient } from '@prisma/client';
import { ImportService } from './src/application/services/ImportService';

const prisma = new PrismaClient();
const importService = new ImportService();

async function run() {
    const data = {
        mccInvoiceId: "890-559-4099-test",
        name: "MCC app chicken test",
        partnerId: null,
        accounts: [
            {
                status: "ACTIVE",
                accountName: "app 7",
                googleAccountId: "142-756-3825",
                currency: "USD"
            }
        ]
    };
    try {
        const res = await importService.createInvoiceMCCWithAccounts(data, "8f816b2b-15e6-4875-af05-ff5e79d60c1a", "127.0.0");
        console.log("Result: ", res);
    } catch (e) {
        console.error("Error: ", e);
    } finally {
        await prisma.$disconnect();
    }
}
run();
