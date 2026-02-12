import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding database (Users only)...');

    // Create admin user
    const adminPassword = await bcrypt.hash('admin123', 10);
    const admin = await prisma.user.findFirst({ where: { email: 'admin@aasystem.local' } });

    if (!admin) {
        await prisma.user.create({
            data: {
                email: 'admin@aasystem.local',
                passwordHash: adminPassword,
                fullName: 'System Admin',
                role: 'ADMIN',
            },
        });
        console.log('✅ Admin user created');
    }

    // Create sample users for each role
    const roles = ['MANAGER', 'BUYER', 'LINKER', 'ASSIGNER', 'UPDATER', 'VIEWER'] as const;
    for (const role of roles) {
        const email = `${role.toLowerCase()}@aasystem.local`;
        const existing = await prisma.user.findFirst({ where: { email } });
        if (!existing) {
            const password = await bcrypt.hash('password123', 10);
            await prisma.user.create({
                data: {
                    email,
                    passwordHash: password,
                    fullName: `${role.charAt(0) + role.slice(1).toLowerCase()} User`,
                    role,
                },
            });
        }
    }
    console.log('✅ Sample users created');
    console.log('🎉 Seeding complete!');
}

main()
    .catch((e) => {
        console.error('❌ Seed error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
