import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Edit2, Trash2 } from 'lucide-react';
import { customersApi, usersApi } from '../api/client';
import { useAuthStore, canAssignMC } from '../store/authStore';

interface Customer {
    id: string;
    name: string;
    contactInfo: string | null;
    status: string;
    totalSpending: string;
    totalAccounts: number;
    activeAccounts: number;
    assignedStaff: { id: string; fullName: string } | null;
    assignedStaffId?: string | null;
    notes?: string | null;
    rangeSpending?: number;
    _count?: { accounts: number };
}

interface User {
    id: string;
    fullName: string;
    email: string;
}

export default function Customers() {
    const { user } = useAuthStore();
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [spendingDays, setSpendingDays] = useState(7);
    const [showModal, setShowModal] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

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
        queryKey: ['customers', search, spendingDays],
        queryFn: () => customersApi.list({ search, spendingDays }),
    });

    const { data: usersData } = useQuery({
        queryKey: ['usersList'],
        queryFn: () => usersApi.list(),
    });

    const createMutation = useMutation({
        mutationFn: (data: object) => customersApi.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['customers'] });
            setShowModal(false);
            showToast('Tạo khách hàng thành công', 'success');
        },
        onError: (error: any) => {
            const errData = error.response?.data?.error;
            let message = 'Có lỗi xảy ra';
            if (typeof errData === 'string') {
                message = errData;
            } else if (Array.isArray(errData)) {
                message = errData.map((e: any) => e.message).join(', ');
            }
            showToast(message, 'error');
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: object }) => customersApi.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['customers'] });
            setShowModal(false);
            setSelectedCustomer(null);
            showToast('Cập nhật khách hàng thành công', 'success');
        },
        onError: (error: any) => {
            const errData = error.response?.data?.error;
            let message = 'Có lỗi xảy ra';
            if (typeof errData === 'string') {
                message = errData;
            } else if (Array.isArray(errData)) {
                message = errData.map((e: any) => e.message).join(', ');
            }
            showToast(message, 'error');
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => customersApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['customers'] });
            setDeleteId(null);
            showToast('Xóa khách hàng thành công', 'success');
        },
        onError: (error: any) => {
            setDeleteId(null);
            const errData = error.response?.data?.error;
            let message = 'Không thể xóa khách hàng này';
            if (typeof errData === 'string') {
                message = errData;
            } else if (Array.isArray(errData)) {
                message = errData.map((e: any) => e.message).join(', ');
            }
            showToast(message, 'error');
        },
    });

    const customers = data?.data?.data || [];
    const users = usersData?.data?.data || [];

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const data: any = {
            name: formData.get('name'),
            contactInfo: formData.get('contactInfo') || null,
            assignedStaffId: formData.get('assignedStaffId') || null,
            notes: formData.get('notes') || null,
        };

        if (selectedCustomer) {
            data.status = formData.get('status');
            updateMutation.mutate({ id: selectedCustomer.id, data });
        } else {
            createMutation.mutate(data);
        }
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Khách hàng (MC)</h1>
                    <p className="page-subtitle">Quản lý khách hàng và phân bổ tài khoản</p>
                </div>
                {canAssignMC(user?.role || 'VIEWER') && (
                    <button
                        className="btn btn-primary"
                        onClick={() => {
                            setSelectedCustomer(null);
                            setShowModal(true);
                        }}
                    >
                        <Plus size={18} />
                        Thêm khách hàng
                    </button>
                )}
            </div>

            <div className="card">
                <div className="card-header">
                    <div className="search-input">
                        <Search />
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Tìm kiếm khách hàng..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Tên khách hàng</th>
                                <th>Trạng thái</th>
                                <th>Tài khoản</th>
                                <th>Tổng chi phí</th>
                                <th style={{ width: '10%' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                                        <span style={{ fontSize: 13 }}>Chi phí</span>
                                        <select
                                            value={spendingDays}
                                            onChange={(e) => setSpendingDays(Number(e.target.value))}
                                            onClick={(e) => e.stopPropagation()}
                                            style={{
                                                fontSize: 11,
                                                padding: '2px 4px',
                                                border: '1px solid var(--border)',
                                                borderRadius: 4,
                                                background: 'var(--bg-primary)',
                                                cursor: 'pointer',
                                                marginLeft: 0,
                                                width: '100%'
                                            }}
                                        >
                                            <option value={1}>Hôm nay</option>
                                            <option value={3}>3 ngày</option>
                                            <option value={7}>7 ngày</option>
                                            <option value={14}>14 ngày</option>
                                            <option value={30}>30 ngày</option>
                                        </select>
                                    </div>
                                </th>
                                <th style={{ width: '15%' }}>NV phụ trách</th>
                                <th style={{ width: '120px', textAlign: 'right' }}>Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={7} style={{ textAlign: 'center' }}>Đang tải...</td>
                                </tr>
                            ) : customers.length > 0 ? (
                                customers.map((customer: Customer) => (
                                    <tr
                                        key={customer.id}
                                        onClick={() => {
                                            if (window.getSelection()?.toString()) return;
                                            navigate(`/customers/${customer.id}`);
                                        }}
                                        style={{ cursor: 'pointer' }}
                                        className="clickable-row"
                                    >
                                        <td><strong>{customer.name}</strong></td>
                                        <td>
                                            <span className={`badge badge-${customer.status === 'ACTIVE' ? 'success' : 'danger'}`} style={{ whiteSpace: 'nowrap' }}>
                                                {customer.status === 'ACTIVE' ? 'Hoạt động' : 'Không hoạt động'}
                                            </span>
                                        </td>
                                        <td>
                                            <span
                                                className="link"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/accounts?mcId=${customer.id}`);
                                                }}
                                                style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 500 }}
                                            >
                                                {customer._count?.accounts ?? customer.totalAccounts ?? 0}
                                            </span>
                                        </td>
                                        <td>${parseFloat(customer.totalSpending || '0').toLocaleString()}</td>
                                        <td>
                                            <span style={{ fontWeight: 600, fontSize: 13, color: (customer.rangeSpending || 0) > 0 ? '#10b981' : 'inherit' }}>
                                                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(customer.rangeSpending || 0)}
                                            </span>
                                        </td>
                                        <td>{customer.assignedStaff?.fullName || '-'}</td>
                                        <td>
                                            {canAssignMC(user?.role || 'VIEWER') && (
                                                <div className="actions" style={{ justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        className="btn-icon"
                                                        title="Chỉnh sửa"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedCustomer(customer);
                                                            setShowModal(true);
                                                        }}
                                                    >
                                                        <Edit2 size={18} />
                                                    </button>
                                                    <button
                                                        className="btn-icon danger"
                                                        title="Xóa"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setDeleteId(customer.id);
                                                        }}
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                                        Chưa có khách hàng nào
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {
                showModal && (
                    <div className="modal-overlay" onClick={() => setShowModal(false)}>
                        <div className="modal" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3 className="modal-title">{selectedCustomer ? 'Cập nhật khách hàng' : 'Thêm khách hàng mới'}</h3>
                                <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
                            </div>
                            <form onSubmit={handleSubmit}>
                                <div className="modal-body">
                                    <div className="form-group">
                                        <label className="form-label">Tên khách hàng *</label>
                                        <input
                                            name="name"
                                            type="text"
                                            className="form-input"
                                            placeholder="@username"
                                            defaultValue={selectedCustomer?.name}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Thông tin liên hệ</label>
                                        <input
                                            name="contactInfo"
                                            type="text"
                                            className="form-input"
                                            placeholder="Email, Telegram, etc."
                                            defaultValue={selectedCustomer?.contactInfo || ''}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Nhân viên phụ trách</label>
                                        <select
                                            name="assignedStaffId"
                                            className="form-select"
                                            defaultValue={selectedCustomer?.assignedStaff?.id || selectedCustomer?.assignedStaffId || ''}
                                        >
                                            <option value="">-- Chọn nhân viên --</option>
                                            {users.map((user: User) => (
                                                <option key={user.id} value={user.id}>{user.fullName}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {selectedCustomer && (
                                        <div className="form-group">
                                            <label className="form-label">Trạng thái</label>
                                            <select
                                                name="status"
                                                className="form-select"
                                                defaultValue={selectedCustomer.status}
                                            >
                                                <option value="ACTIVE">Hoạt động (Active)</option>
                                                <option value="INACTIVE">Không hoạt động (Inactive)</option>
                                            </select>
                                        </div>
                                    )}
                                    <div className="form-group">
                                        <label className="form-label">Ghi chú</label>
                                        <textarea
                                            name="notes"
                                            className="form-input"
                                            rows={3}
                                            defaultValue={selectedCustomer?.notes || ''}
                                        />
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Hủy</button>
                                    <button
                                        type="submit"
                                        className="btn btn-primary"
                                        disabled={createMutation.isPending || updateMutation.isPending}
                                    >
                                        {createMutation.isPending || updateMutation.isPending ? 'Đang xử lý...' : (selectedCustomer ? 'Cập nhật' : 'Tạo khách hàng')}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* Delete Confirmation Modal */}
            {
                deleteId && (
                    <div className="modal-overlay" onClick={() => setDeleteId(null)}>
                        <div className="modal" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3 className="modal-title">Xác nhận xóa</h3>
                                <button className="modal-close" onClick={() => setDeleteId(null)}>×</button>
                            </div>
                            <div className="modal-body">
                                <p>Bạn có chắc chắn muốn xóa khách hàng này không? Hành động này không thể hoàn tác.</p>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setDeleteId(null)}>Hủy</button>
                                <button
                                    className="btn btn-danger"
                                    onClick={() => deleteId && deleteMutation.mutate(deleteId)}
                                    disabled={deleteMutation.isPending}
                                >
                                    {deleteMutation.isPending ? 'Đang xóa...' : 'Xóa'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Toast Notification */}
            {
                toast && (
                    <div className={`toast toast-${toast.type}`}>
                        {toast.type === 'success' ? '✓' : '✕'} {toast.message}
                    </div>
                )
            }
        </div >
    );
}
