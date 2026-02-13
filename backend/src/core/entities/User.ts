export type UserRole = 'ADMIN' | 'MANAGER' | 'BUYER' | 'LINKER' | 'ASSIGNER' | 'UPDATER' | 'VIEWER';

export interface User {
    id: string;
    email: string;
    passwordHash: string;
    fullName: string;
    role: UserRole;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export type SafeUser = Omit<User, 'passwordHash'>;
