export interface UserDTO {
    id: string;
    email: string;
    fullName: string;
    role: string;
    isActive: boolean;
    createdAt?: Date;
}

export interface LoginRequestDTO {
    email: string;
    password: string;
}

export interface LoginResponseDTO {
    token: string;
    user: Omit<UserDTO, 'isActive' | 'createdAt'>;
}

export interface RegisterRequestDTO {
    email: string;
    password: string;
    fullName: string;
    role?: string;
}
