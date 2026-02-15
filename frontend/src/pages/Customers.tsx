import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Filter, Edit2, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import Dropdown from '../components/Dropdown';
import SearchDropdown from '../components/SearchDropdown';
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

type SortField = 'name' | 'status' | 'totalSpending' | 'totalAccounts' | 'rangeSpending' | 'createdAt';
type SortOrder = 'asc' | 'desc';

export default function Customers() {
    const { user } = useAuthStore();
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [spendingDays, setSpendingDays] = useState(7);
    const [showModal, setShowModal] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // Sorting
    const [sortField, setSortField] = useState<SortField>('createdAt');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

    const [isSearchOpen, setIsSearchOpen] = useState(false);

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
        queryKey: ['customers', search, spendingDays, page, limit, sortField, sortOrder],
        queryFn: () => customersApi.list({
            search,
            spendingDays,
            page,
            limit,
            sortBy: sortField,
            sortOrder
        }),
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
    const pagination = data?.data?.pagination || { total: 0, pages: 0 };
    const users = usersData?.data?.data || [];

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return null;
        return sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
    };

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



    const spendingDaysLabels: Record<number, string> = {
        1: 'Hôm nay',
        3: '3 ngày',
        7: '7 ngày',
        14: '14 ngày',
        30: '30 ngày'
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

            <div className="card" style={{ overflow: 'visible' }}>
                <div className="card-header" style={{ gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-start', overflow: 'visible' }}>
                    <Filter size={18} style={{ color: 'var(--text-muted)' }} />
                    <div style={{ position: 'relative' }}>
                        <button
                            className={`btn ${search || isSearchOpen ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setIsSearchOpen(true)}
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
                            placeholder="Nhập tên khách hàng, email hoặc dán danh sách ID (mỗi dòng một ID)..."
                        />
                    </div>

                    <Dropdown
                        trigger={
                            <button className="btn btn-secondary" style={{ gap: 6 }}>
                                {spendingDaysLabels[spendingDays]}
                                <ChevronDown size={14} />
                            </button>
                        }
                        items={[
                            { key: '1', label: 'Hôm nay', onClick: () => setSpendingDays(1) },
                            { key: '3', label: '3 ngày', onClick: () => setSpendingDays(3) },
                            { key: '7', label: '7 ngày', onClick: () => setSpendingDays(7) },
                            { key: '14', label: '14 ngày', onClick: () => setSpendingDays(14) },
                            { key: '30', label: '30 ngày', onClick: () => setSpendingDays(30) },
                        ]}
                    />
                </div>
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('name')}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        Tên khách hàng <SortIcon field="name" />
                                    </div>
                                </th>
                                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('status')}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        Trạng thái <SortIcon field="status" />
                                    </div>
                                </th>
                                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('totalAccounts')}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        Tài khoản <SortIcon field="totalAccounts" />
                                    </div>
                                </th>
                                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('totalSpending')}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        Tổng chi phí <SortIcon field="totalSpending" />
                                    </div>
                                </th>
                                <th style={{ width: '10%', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('rangeSpending')}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        Chi phí <SortIcon field="rangeSpending" />
                                    </div>
                                </th>
                                <th style={{ width: '15%' }}>NV phụ trách</th>
                                <th style={{ width: '120px', textAlign: 'right' }}>Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={7} style={{ textAlign: 'center', padding: 40 }}>
                                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12 }}>
                                            <div className="spinner" />
                                            <span style={{ color: 'var(--text-muted)' }}>Đang tải dữ liệu...</span>
                                        </div>
                                    </td>
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
                                    <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                                            <Search size={32} style={{ opacity: 0.3 }} />
                                            <span>Không tìm thấy khách hàng nào phù hợp</span>
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
