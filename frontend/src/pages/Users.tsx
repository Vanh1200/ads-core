import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Filter, Edit2, Key, UserCheck, UserX, ChevronDown } from 'lucide-react';
import SearchDropdown from '../components/SearchDropdown';
import { usersApi } from '../api/client';
import { useAuthStore } from '../store/authStore';

interface User {
    id: string;
    email: string;
    fullName: string;
    role: string;
    isActive: boolean;
    createdAt: string;
}

const ROLES = {
    ADMIN: 'Quản trị viên',
    MANAGER: 'Quản lý',
    BUYER: 'NV Mua tài khoản',
    LINKER: 'NV Nối tín',
    ASSIGNER: 'NV Giao khách',
    UPDATER: 'NV Cập nhật tiền',
    VIEWER: 'NV Xem báo cáo',
};

export default function Users() {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);

    const [isSearchOpen, setIsSearchOpen] = useState(false);
    // const [searchQuery, setSearchQuery] = useState(''); // This state is now managed by SearchDropdown
    const searchDropdownRef = useRef<HTMLDivElement>(null); // This ref is now managed by SearchDropdown

    const [showModal, setShowModal] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const { user: currentUser } = useAuthStore();
    const queryClient = useQueryClient();

    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
    };

    const { data, isLoading } = useQuery({
        queryKey: ['users', search, page, limit],
        queryFn: () => usersApi.list({ search, page, limit }),
    });

    const createMutation = useMutation({
        mutationFn: (data: object) => usersApi.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            setShowModal(false);
            showToast('Tạo nhân viên thành công', 'success');
        },
        onError: (error: any) => {
            showToast(error.response?.data?.error || 'Có lỗi xảy ra', 'error');
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: object }) => usersApi.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            setShowModal(false);
            setSelectedUser(null);
            showToast('Cập nhật nhân viên thành công', 'success');
        },
        onError: (error: any) => {
            showToast(error.response?.data?.error || 'Có lỗi xảy ra', 'error');
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => usersApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            setDeleteId(null);
            showToast('Vô hiệu hóa nhân viên thành công', 'success');
        },
        onError: (error: any) => {
            setDeleteId(null);
            showToast(error.response?.data?.error || 'Không thể vô hiệu hóa nhân viên này', 'error');
        },
    });

    const resetPasswordMutation = useMutation({
        mutationFn: ({ id, password }: { id: string; password: string }) => usersApi.resetPassword(id, password),
        onSuccess: () => {
            setShowPasswordModal(false);
            setSelectedUser(null);
            showToast('Đặt lại mật khẩu thành công', 'success');
        },
        onError: (error: any) => {
            showToast(error.response?.data?.error || 'Có lỗi xảy ra', 'error');
        },
    });

    const users = data?.data?.data || [];
    const pagination = data?.data?.pagination || { total: 0, pages: 0 };

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);

        if (selectedUser) {
            const data = {
                fullName: formData.get('fullName'),
                role: formData.get('role'),
                isActive: formData.get('isActive') === 'true',
            };
            updateMutation.mutate({ id: selectedUser.id, data });
        } else {
            const data = {
                email: formData.get('email'),
                password: formData.get('password'),
                fullName: formData.get('fullName'),
                role: formData.get('role'),
            };
            createMutation.mutate(data);
        }
    };

    const handleResetPassword = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        if (selectedUser) {
            resetPasswordMutation.mutate({
                id: selectedUser.id,
                password: formData.get('password') as string,
            });
        }
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('vi-VN');
    };

    // Filter handlers
    // useEffect(() => { // This useEffect is now handled by SearchDropdown
    //     const handleClickOutside = (event: MouseEvent) => {
    //         if (searchDropdownRef.current && !searchDropdownRef.current.contains(event.target as Node)) {
    //             setIsSearchOpen(false);
    //         }
    //     };

    //     if (isSearchOpen) {
    //         document.addEventListener('mousedown', handleClickOutside);
    //     }
    //     return () => {
    //         document.removeEventListener('mousedown', handleClickOutside);
    //     };
    // }, [isSearchOpen]);

    const handleOpenSearch = () => {
        // setSearchQuery(search); // This state is now managed by SearchDropdown
        setIsSearchOpen(true);
    };

    // const handleApplySearch = () => { // This function is now handled by SearchDropdown
    //     setSearch(searchQuery.trim());
    //     setPage(1);
    //     setIsSearchOpen(false);
    // };

    // const handleKeyDown = (e: React.KeyboardEvent) => { // This function is now handled by SearchDropdown
    //     if (e.key === 'Enter' && !e.shiftKey) {
    //         e.preventDefault();
    //         handleApplySearch();
    //     }
    // };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Nhân viên</h1>
                    <p className="page-subtitle">Quản lý tài khoản và phân quyền nhân viên</p>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={() => {
                        setSelectedUser(null);
                        setShowModal(true);
                    }}
                >
                    <Plus size={18} />
                    Thêm nhân viên
                </button>
            </div>

            <div className="card" style={{ overflow: 'visible' }}>
                <div className="card-header" style={{ gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-start', overflow: 'visible' }}>
                    <Filter size={18} style={{ color: 'var(--text-muted)' }} />
                    <div style={{ position: 'relative' }} ref={searchDropdownRef}>
                        <button
                            className={`btn ${search || isSearchOpen ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={handleOpenSearch}
                            style={{ gap: 8 }}
                        >
                            <Search size={16} />
                            {search ? `Tìm: ${search}` : 'Tìm kiếm'}
                            <ChevronDown size={14} />
                        </button>

                        <SearchDropdown
                            isOpen={isSearchOpen}
                            onClose={() => setIsSearchOpen(false)}
                            onApply={(value) => {
                                setSearch(value.trim());
                                setIsSearchOpen(false);
                                setPage(1);
                            }}
                            onClear={() => {
                                setSearch('');
                                setIsSearchOpen(false);
                                setPage(1);
                            }}
                            initialValue={search}
                            placeholder="Nhập tên nhân viên, email hoặc dán danh sách ID (mỗi dòng một ID)..."
                        />
                    </div>
                </div>
                <div className="table-container">
                    <table className="data-table" style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                <th>Họ tên</th>
                                <th>Email</th>
                                <th>Vai trò</th>
                                <th>Trạng thái</th>
                                <th>Ngày tạo</th>
                                <th style={{ textAlign: 'right' }}>Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', padding: 40 }}>
                                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12 }}>
                                            <div className="spinner" />
                                            <span style={{ color: 'var(--text-muted)' }}>Đang tải dữ liệu...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : users.length > 0 ? (
                                users.map((u: User) => (
                                    <tr key={u.id}>
                                        <td style={{ fontWeight: 500 }}>
                                            {u.fullName}
                                            {u.id === currentUser?.id && <span className="badge badge-info" style={{ marginLeft: '8px' }}>Bạn</span>}
                                        </td>
                                        <td>{u.email}</td>
                                        <td>{ROLES[u.role as keyof typeof ROLES] || u.role}</td>
                                        <td>
                                            <span className={`badge ${u.isActive ? 'badge-success' : 'badge-danger'}`}>
                                                {u.isActive ? 'Hoạt động' : 'Đã khóa'}
                                            </span>
                                        </td>
                                        <td>{formatDate(u.createdAt)}</td>
                                        <td>
                                            <div className="actions" style={{ justifyContent: 'flex-end' }}>
                                                <button
                                                    className="btn-icon"
                                                    title="Đặt lại mật khẩu"
                                                    onClick={() => {
                                                        setSelectedUser(u);
                                                        setShowPasswordModal(true);
                                                    }}
                                                >
                                                    <Key size={18} />
                                                </button>
                                                <button
                                                    className="btn-icon"
                                                    title="Chỉnh sửa"
                                                    onClick={() => {
                                                        setSelectedUser(u);
                                                        setShowModal(true);
                                                    }}
                                                >
                                                    <Edit2 size={18} />
                                                </button>
                                                {u.id !== currentUser?.id && (
                                                    <button
                                                        className={`btn-icon ${u.isActive ? 'danger' : 'success'}`}
                                                        title={u.isActive ? 'Vô hiệu hóa' : 'Kích hoạt lại'}
                                                        onClick={() => {
                                                            if (u.isActive) {
                                                                setDeleteId(u.id);
                                                            } else {
                                                                updateMutation.mutate({ id: u.id, data: { isActive: true } });
                                                            }
                                                        }}
                                                    >
                                                        {u.isActive ? <UserX size={18} /> : <UserCheck size={18} />}
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                                            <Search size={32} style={{ opacity: 0.3 }} />
                                            <span>Không tìm thấy nhân viên nào phù hợp</span>
                                            {search && (
                                                <button className="btn btn-secondary btn-sm" onClick={() => { setSearch(''); setPage(1); }}>
                                                    Xóa bộ lọc
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {pagination.total > 0 && (
                    <div className="pagination-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Số hàng hiển thị:</span>
                            <select
                                className="form-select"
                                style={{ width: 'auto', padding: '4px 8px', fontSize: 13 }}
                                value={limit}
                                onChange={(e) => {
                                    setLimit(Number(e.target.value));
                                    setPage(1);
                                }}
                            >
                                <option value={10}>10</option>
                                <option value={20}>20</option>
                                <option value={30}>30</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                            </select>
                            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                                {((page - 1) * limit) + 1} - {Math.min(page * limit, pagination.total)} trong tổng số {pagination.total}
                            </span>
                        </div>

                        <div className="pagination">
                            <button
                                className="pagination-btn"
                                disabled={page <= 1}
                                onClick={() => setPage(page - 1)}
                            >
                                ← Trước
                            </button>
                            <span className="pagination-info">
                                Trang {page} / {pagination.pages}
                            </span>
                            <button
                                className="pagination-btn"
                                disabled={page >= pagination.pages}
                                onClick={() => setPage(page + 1)}
                            >
                                Sau →
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">
                                {selectedUser ? 'Cập nhật nhân viên' : 'Thêm nhân viên mới'}
                            </h3>
                            <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Họ tên *</label>
                                    <input
                                        name="fullName"
                                        type="text"
                                        className="form-input"
                                        placeholder="Nhập họ tên"
                                        defaultValue={selectedUser?.fullName}
                                        required
                                    />
                                </div>
                                {!selectedUser && (
                                    <>
                                        <div className="form-group">
                                            <label className="form-label">Email *</label>
                                            <input
                                                name="email"
                                                type="email"
                                                className="form-input"
                                                placeholder="example@company.com"
                                                required
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Mật khẩu *</label>
                                            <input
                                                name="password"
                                                type="text"
                                                className="form-input"
                                                placeholder="Mật khẩu ít nhất 6 ký tự"
                                                required
                                                minLength={6}
                                            />
                                        </div>
                                    </>
                                )}
                                <div className="form-group">
                                    <label className="form-label">Vai trò *</label>
                                    <select
                                        name="role"
                                        className="form-select"
                                        defaultValue={selectedUser?.role || 'VIEWER'}
                                    >
                                        {Object.entries(ROLES).map(([value, label]) => (
                                            <option key={value} value={value}>{label}</option>
                                        ))}
                                    </select>
                                </div>
                                {selectedUser && (
                                    <div className="form-group">
                                        <label className="form-label">Trạng thái</label>
                                        <select
                                            name="isActive"
                                            className="form-select"
                                            defaultValue={String(selectedUser.isActive)}
                                        >
                                            <option value="true">Hoạt động</option>
                                            <option value="false">Vô hiệu hóa</option>
                                        </select>
                                    </div>
                                )}
                            </div>
                            <div className="modal-footer">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setShowModal(false)}
                                >
                                    Hủy
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={createMutation.isPending || updateMutation.isPending}
                                >
                                    {createMutation.isPending || updateMutation.isPending ? 'Đang xử lý...' : (selectedUser ? 'Cập nhật' : 'Thêm mới')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Reset Password Modal */}
            {showPasswordModal && selectedUser && (
                <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
                    <div className="modal" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Đặt lại mật khẩu</h3>
                            <button className="modal-close" onClick={() => setShowPasswordModal(false)}>×</button>
                        </div>
                        <form onSubmit={handleResetPassword}>
                            <div className="modal-body">
                                <p style={{ marginBottom: '16px' }}>
                                    Đặt lại mật khẩu cho nhân viên <strong>{selectedUser.fullName}</strong>.
                                </p>
                                <div className="form-group">
                                    <label className="form-label">Mật khẩu mới *</label>
                                    <input
                                        name="password"
                                        type="text"
                                        className="form-input"
                                        placeholder="Nhập mật khẩu mới"
                                        required
                                        minLength={6}
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowPasswordModal(false)}>Hủy</button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={resetPasswordMutation.isPending}
                                >
                                    {resetPasswordMutation.isPending ? 'Đang xử lý...' : 'Đặt lại mật khẩu'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Deactivate Confirmation Modal */}
            {deleteId && (
                <div className="modal-overlay" onClick={() => setDeleteId(null)}>
                    <div className="modal" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Xác nhận vô hiệu hóa</h3>
                            <button className="modal-close" onClick={() => setDeleteId(null)}>×</button>
                        </div>
                        <div className="modal-body">
                            <p>Bạn có chắc chắn muốn vô hiệu hóa nhân viên này không? Họ sẽ không thể đăng nhập vào hệ thống.</p>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setDeleteId(null)}>Hủy</button>
                            <button
                                className="btn btn-danger"
                                onClick={() => deleteId && deleteMutation.mutate(deleteId)}
                                disabled={deleteMutation.isPending}
                            >
                                {deleteMutation.isPending ? 'Đang xử lý...' : 'Vô hiệu hóa'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast Notification */}
            {toast && (
                <div className={`toast toast-${toast.type}`}>
                    {toast.type === 'success' ? '✓' : '✕'} {toast.message}
                </div>
            )}
        </div>
    );
}
