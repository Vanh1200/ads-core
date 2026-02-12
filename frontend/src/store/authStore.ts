import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi } from '../api/client';

interface User {
    id: string;
    email: string;
    fullName: string;
    role: 'ADMIN' | 'MANAGER' | 'BUYER' | 'LINKER' | 'ASSIGNER' | 'UPDATER' | 'VIEWER';
}

interface AuthState {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => void;
    checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: true,

            login: async (email: string, password: string) => {
                const response = await authApi.login(email, password);
                const { token, user } = response.data;
                localStorage.setItem('token', token);
                sessionStorage.clear(); // Clear old session data on fresh login
                set({ user, token, isAuthenticated: true, isLoading: false });
            },

            logout: () => {
                localStorage.removeItem('token');
                sessionStorage.clear(); // Clear all session data on logout
                set({ user: null, token: null, isAuthenticated: false, isLoading: false });
            },

            checkAuth: async () => {
                const token = localStorage.getItem('token');
                if (!token) {
                    set({ isLoading: false, isAuthenticated: false });
                    return;
                }
                try {
                    const response = await authApi.me();
                    set({ user: response.data, token, isAuthenticated: true, isLoading: false });
                } catch {
                    localStorage.removeItem('token');
                    sessionStorage.clear();
                    set({ user: null, token: null, isAuthenticated: false, isLoading: false });
                }
            },
        }),
        {
            name: 'auth-storage',
            partialize: (state) => ({ token: state.token }),
        }
    )
);

// Role permission helpers
export const canManageBatches = (role: string) => ['ADMIN', 'MANAGER', 'BUYER'].includes(role);
export const canManagePartners = (role: string) => ['ADMIN', 'MANAGER'].includes(role);
export const canLinkMI = (role: string) => ['ADMIN', 'MANAGER', 'LINKER'].includes(role);
export const canAssignMC = (role: string) => ['ADMIN', 'MANAGER', 'ASSIGNER'].includes(role);
export const canUpdateSpending = (role: string) => ['ADMIN', 'MANAGER', 'UPDATER'].includes(role);
export const isAdmin = (role: string) => role === 'ADMIN';
