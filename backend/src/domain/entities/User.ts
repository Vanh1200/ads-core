export interface User {
    id: string;
    email: string;
    fullName: string;
    role: string;
    isActive: boolean;
    passwordHash: string;
    createdAt: Date;
    updatedAt: Date;
}
