import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fix() {
    try {
        console.log('--- FIXING SPENDING DATA ---');

        // 1. Update all spending records to 2026
        console.log('Updating spending years to 2026...');
        const allSpends = await prisma.spendingRecord.findMany({
            select: { id: true, spendingDate: true }
        });

        for (let i = 0; i < allSpends.length; i += 1000) {
            const chunk = allSpends.slice(i, i + 1000);
            await Promise.all(chunk.map(s => {
                const newDate = new Date(s.spendingDate);
                newDate.setFullYear(2026);
                return prisma.spendingRecord.update({
                    where: { id: s.id },
                    data: {
                        spendingDate: newDate,
                        periodStart: newDate,
                        periodEnd: newDate
                    }
                });
            }));
            process.stdout.write('.');
        }
        console.log('\nSpending dates updated.');

        // 2. Recalculate totalSpending for each account
        console.log('Recalculating totalSpending for accounts...');
        const summaries = await prisma.spendingRecord.groupBy({
            by: ['accountId'],
            _sum: { amount: true }
        });

        for (let i = 0; i < summaries.length; i += 500) {
            const chunk = summaries.slice(i, i + 500);
            await Promise.all(chunk.map(s =>
                prisma.account.update({
                    where: { id: s.accountId },
                    data: { totalSpending: s._sum.amount || 0 }
                })
            ));
            process.stdout.write('|');
        }

        console.log('\n--- FIX COMPLETE ---');
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

fix();
