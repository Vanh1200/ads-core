import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import ConfirmModal from './ConfirmModal';
import { useQueryClient } from '@tanstack/react-query';
import {
    LayoutDashboard,
    Layers,
    FileText,
    Users,
    Database,
    Upload,
    Activity,
    LogOut,
    Link,
} from 'lucide-react';

const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard', section: 'Tổng quan' },
    { path: '/partners', icon: Users, label: 'Đối tác', section: 'Quản lý' },
    { path: '/batches', icon: Layers, label: 'Lô tài khoản (MA)', section: 'Quản lý' },
    { path: '/invoice-mccs', icon: FileText, label: 'Invoice MCC (MI)', section: 'Quản lý' },
    { path: '/customers', icon: Users, label: 'Khách hàng (MC)', section: 'Quản lý' },
    { path: '/accounts', icon: Database, label: 'Tài khoản', section: 'Quản lý' },
    { path: '/import', icon: Upload, label: 'Import dữ liệu', section: 'Công cụ' },
    { path: '/quick-link', icon: Link, label: 'Liên kết tín nhanh', section: 'Công cụ' },
    { path: '/activity-logs', icon: Activity, label: 'Lịch sử hoạt động', section: 'Hệ thống' },
    { path: '/users', icon: Users, label: 'Nhân viên', section: 'Hệ thống' },
];

export default function Layout() {
    const { user, logout } = useAuthStore();
    const location = useLocation();
    const queryClient = useQueryClient();

    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

    const filteredNavItems = navItems.filter(item => {
        if (!user) return false;

        // Admin has access to everything
        if (user.role === 'ADMIN') return true;

        // Role-based filtering
        switch (item.path) {
            case '/': // Dashboard
            case '/partners': // Partners
            case '/accounts': // Accounts
            case '/batches': // Manage Batches (Read-only for most)
            case '/invoice-mccs': // Manage MI (Read-only for most)
            case '/customers': // Manage MC (Read-only for most)
                return true;
            case '/import': // Import
            case '/quick-link': // Quick Link
                return ['ADMIN', 'MANAGER', 'BUYER', 'LINKER', 'UPDATER'].includes(user.role);
            case '/activity-logs':
                return false; // Only ADMIN (handled by first check)
            case '/users':
                return false; // Only ADMIN (handled by first check)
            default:
                return false;
        }
    });

    const groupedNav = filteredNavItems.reduce((acc, item) => {
        if (!acc[item.section]) acc[item.section] = [];
        acc[item.section].push(item);
        return acc;
    }, {} as Record<string, typeof navItems>);

    const roleLabels: Record<string, string> = {
        ADMIN: 'Quản trị viên',
        MANAGER: 'Quản lý',
        BUYER: 'NV Mua tài khoản',
        LINKER: 'NV Nối tín',
        ASSIGNER: 'NV Giao khách',
        UPDATER: 'NV Cập nhật tiền',
        VIEWER: 'NV Xem báo cáo',
    };

    return (
        <div className="app-layout">
            <aside className="sidebar">
                <div className="sidebar-header">
                    <NavLink to="/" className="sidebar-logo">
                        <div className="sidebar-logo-icon">AC</div>
                        <span>Ads Core System</span>
                    </NavLink>
                </div>

                <nav className="sidebar-nav">
                    {Object.entries(groupedNav).map(([section, items]) => (
                        <div key={section} className="nav-section">
                            <div className="nav-section-title">{section}</div>
                            {items.map((item) => (
                                <NavLink
                                    key={item.path}
                                    to={item.path}
                                    onClick={() => {
                                        if (item.path === '/accounts') {
                                            sessionStorage.removeItem('accounts_filters');
                                            sessionStorage.removeItem('lastAccountPath');
                                            window.dispatchEvent(new CustomEvent('reset-accounts-filters'));
                                        }
                                    }}
                                    className={({ isActive }) =>
                                        `nav-link ${isActive && location.pathname === item.path ? 'active' : ''}`
                                    }
                                    end={item.path === '/'}
                                >
                                    <item.icon size={20} />
                                    <span>{item.label}</span>
                                </NavLink>
                            ))}
                        </div>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <div className="user-info">
                        <div className="user-avatar">
                            {user?.fullName?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <div className="user-details">
                            <div className="user-name">{user?.fullName}</div>
                            <div className="user-role">{roleLabels[user?.role || 'VIEWER']}</div>
                        </div>
                        <button
                            className="logout-btn"
                            onClick={() => setShowLogoutConfirm(true)}
                            title="Đăng xuất"
                        >
                            <LogOut size={18} />
                        </button>
                    </div>
                </div>
            </aside>

            <main className="main-content">
                <Outlet />
            </main>

            <ConfirmModal
                isOpen={showLogoutConfirm}
                onClose={() => setShowLogoutConfirm(false)}
                onConfirm={() => {
                    logout();
                    setShowLogoutConfirm(false);
                    queryClient.removeQueries();
                    sessionStorage.clear();
                }}
                title="Xác nhận đăng xuất"
                confirmText="Đăng xuất"
                cancelText="Hủy"
                type="warning"
            >
                <div>
                    <p>Bạn có chắc chắn muốn đăng xuất khỏi hệ thống?</p>
                </div>
            </ConfirmModal>
        </div>
    );
}
