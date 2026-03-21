import { PrismaClient } from '@prisma/client';
import { PrismaAccountRepository } from './src/infrastructure/database/repositories/PrismaAccountRepository';
const prisma = new PrismaClient();
const repo = new PrismaAccountRepository();

async function run() {
    try {
        await repo.create({
            googleAccountId: "142-756-3825-test1",
            accountName: "app 7 test",
            status: "ACTIVE" as any,
            currency: "USD",
            currentMiId: "494bbae3-ec88-4330-87cb-4646fbddb5af",
            mccAccountName: "MCC app chicken test",
            mccAccountId: "890-559-4099-test"
        } as any);
        console.log("Success");
    } catch (e) {
        console.error("Prisma Error:", e);
    } finally {
        await prisma.$disconnect();
    }
}
run();
