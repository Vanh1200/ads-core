import prisma from './src/config/database';
import bcrypt from 'bcryptjs';

async function resetPassword() {
    try {
        const email = 'viewer@aasystem.local';
        const newPassword = 'admin123';
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        const user = await prisma.user.update({
            where: { email },
            data: { passwordHash: hashedPassword },
        });

        console.log(`Password for ${user.email} has been reset to ${newPassword}`);
    } catch (error) {
        console.error('Error resetting password:', error);
    } finally {
        await prisma.$disconnect();
    }
}

resetPassword();
