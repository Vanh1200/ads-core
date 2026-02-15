import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Filter, Edit2, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import Dropdown from '../components/Dropdown';
import SearchDropdown from '../components/SearchDropdown';
import { invoiceMCCsApi, partnersApi } from '../api/client';
import { useAuthStore, canLinkMI } from '../store/authStore';

interface InvoiceMCC {
    id: string;
    name: string;
    mccInvoiceId: string;
    status: string;
    creditStatus: string;
    linkedAccountsCount: number;
    activeAccountsCount: number;
    partner: { id: string; name: string } | null;
    partnerId?: string | null;
    notes?: string | null;
    rangeSpending?: number;
    _count?: { accounts: number };
}

interface Partner {
    id: string;
    name: string;
}

type SortField = 'name' | 'mccInvoiceId' | 'status' | 'creditStatus' | 'rangeSpending' | 'createdAt';
type SortOrder = 'asc' | 'desc';

export default function InvoiceMCCs() {
    const { user } = useAuthStore();
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [spendingDays, setSpendingDays] = useState(7);
    const [showModal, setShowModal] = useState(false);
    const [selectedInvoiceMCC, setSelectedInvoiceMCC] = useState<InvoiceMCC | null>(null);
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
        queryKey: ['invoiceMCCs', search, spendingDays, page, limit, sortField, sortOrder],
        queryFn: () => invoiceMCCsApi.list({
            search,
            spendingDays,
            page,
            limit,
            sortBy: sortField,
            sortOrder
        }),
    });

    const { data: partnersData } = useQuery({
        queryKey: ['partnersList'],
        queryFn: () => partnersApi.list({ limit: 100 }), // Fetch enough partners
    });

    const createMutation = useMutation({
        mutationFn: (data: object) => invoiceMCCsApi.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['invoiceMCCs'] });
            setShowModal(false);
            showToast('Tạo Invoice MCC thành công', 'success');
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
        mutationFn: ({ id, data }: { id: string; data: object }) => invoiceMCCsApi.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['invoiceMCCs'] });
            setShowModal(false);
            setSelectedInvoiceMCC(null);
            showToast('Cập nhật Invoice MCC thành công', 'success');
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
        mutationFn: (id: string) => invoiceMCCsApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['invoiceMCCs'] });
            setDeleteId(null);
            showToast('Xóa Invoice MCC thành công', 'success');
        },
        onError: (error: any) => {
            setDeleteId(null);
            const errData = error.response?.data?.error;
            let message = 'Không thể xóa Invoice MCC này';
            if (typeof errData === 'string') {
                message = errData;
            } else if (Array.isArray(errData)) {
                message = errData.map((e: any) => e.message).join(', ');
            }
            showToast(message, 'error');
        },
    });

    const invoiceMCCs = data?.data?.data || [];
    const pagination = data?.data?.pagination || { total: 0, pages: 0 };
    const partners = partnersData?.data?.data || [];

    const statusLabels: Record<string, { label: string; class: string }> = {
        ACTIVE: { label: 'Hoạt động', class: 'success' },
        PENDING: { label: 'Chờ kết nối', class: 'warning' },
        EXHAUSTED: { label: 'Hết tín dụng', class: 'danger' },
        INACTIVE: { label: 'Không hoạt động', class: 'danger' },
    };

    const creditStatusLabels: Record<string, { label: string; class: string }> = {
        PENDING: { label: 'Chờ kết nối', class: 'warning' },
        CONNECTED: { label: 'Đã kết nối', class: 'success' },
        FAILED: { label: 'Lỗi', class: 'danger' },
    };

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
            partnerId: formData.get('partnerId') || null,
            notes: formData.get('notes') || null,
        };

        // Create only fields
        if (!selectedInvoiceMCC) {
            data.mccInvoiceId = formData.get('mccInvoiceId');
        } else {
            // Update only fields
            data.status = formData.get('status');
            data.creditStatus = formData.get('creditStatus');
        }

        if (data.partnerId === '') data.partnerId = null;

        if (selectedInvoiceMCC) {
            updateMutation.mutate({ id: selectedInvoiceMCC.id, data });
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
                    <h1 className="page-title">Invoice MCC (MI)</h1>
                    <p className="page-subtitle">Quản lý MCC invoice cho thanh toán</p>
                </div>
                {canLinkMI(user?.role || 'VIEWER') && (
                    <button
                        className="btn btn-primary"
                        onClick={() => {
                            setSelectedInvoiceMCC(null);
                            setShowModal(true);
                        }}
                    >
                        <Plus size={18} />
                        Thêm MI mới
                    </button>
                )}
            </div>

            <div className="card" style={{ overflow: 'visible' }}>
                <div className="card-header" style={{ gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                    <Filter size={18} style={{ color: 'var(--text-muted)' }} />
                    <div style={{ position: 'relative' }}>
                        <button
                            className={`btn ${search || isSearchOpen ? 'btn-primary' : 'btn-secondary'} `}
                            onClick={() => setIsSearchOpen(true)}
                            style={{ gap: 8 }}
                        >
                            <Search size={16} />
                            {search ? `Tìm: ${search} ` : 'Tìm kiếm'}
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
                            placeholder="Nhập tên MI, email hoặc dán danh sách ID (mỗi dòng một ID)..."
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
                                        Tên <SortIcon field="name" />
                                    </div>
                                </th>
                                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('mccInvoiceId')}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        MCC Invoice ID <SortIcon field="mccInvoiceId" />
                                    </div>
                                </th>
                                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('status')}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        Trạng thái <SortIcon field="status" />
                                    </div>
                                </th>
                                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('creditStatus')}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        Tín dụng <SortIcon field="creditStatus" />
                                    </div>
                                </th>
                                <th>Tài khoản</th>
                                <th style={{ width: '10%', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('rangeSpending')}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        Chi phí <SortIcon field="rangeSpending" />
                                    </div>
                                </th>
                                <th style={{ width: '15%' }}>Đối tác</th>
                                <th style={{ width: '120px', textAlign: 'right' }}>Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={8} style={{ textAlign: 'center', padding: 40 }}>
                                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12 }}>
                                            <div className="spinner" />
                                            <span style={{ color: 'var(--text-muted)' }}>Đang tải dữ liệu...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : invoiceMCCs.length > 0 ? (
                                invoiceMCCs.map((mi: InvoiceMCC) => (
                                    <tr
                                        key={mi.id}
                                        onClick={() => {
                                            if (window.getSelection()?.toString()) return;
                                            navigate(`/ invoice - mccs / ${mi.id} `);
                                        }}
                                        style={{ cursor: 'pointer' }}
                                        className="clickable-row"
                                    >
                                        <td><strong>{mi.name}</strong></td>
                                        <td><code>{mi.mccInvoiceId}</code></td>
                                        <td>
                                            <span className={`badge badge - ${statusLabels[mi.status]?.class || 'info'} `} style={{ whiteSpace: 'nowrap' }}>
                                                {statusLabels[mi.status]?.label || mi.status}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`badge badge - ${creditStatusLabels[mi.creditStatus]?.class || 'info'} `}>
                                                {creditStatusLabels[mi.creditStatus]?.label || mi.creditStatus}
                                            </span>
                                        </td>
                                        <td>
                                            <span
                                                className="link"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/ accounts ? miId = ${mi.id} `);
                                                }}
                                                style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 500 }}
                                            >
                                                {mi._count?.accounts ?? mi.linkedAccountsCount ?? 0}
                                            </span>
                                        </td>
                                        <td>
                                            <span style={{ fontWeight: 600, fontSize: 13, color: (mi.rangeSpending || 0) > 0 ? '#10b981' : 'inherit' }}>
                                                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(mi.rangeSpending || 0)}
                                            </span>
                                        </td>
                                        <td>
                                            {mi.partner ? (
                                                <span
                                                    className="link"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        navigate(`/ partners ? search = ${mi.partner?.name} `);
                                                    }}
                                                    style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 500 }}
                                                >
                                                    {mi.partner.name}
                                                </span>
                                            ) : '-'}
                                        </td>
                                        <td>
                                            {canLinkMI(user?.role || 'VIEWER') && (
                                                <div className="actions" style={{ justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        className="btn-icon"
                                                        title="Chỉnh sửa"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedInvoiceMCC(mi);
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
                                                            setDeleteId(mi.id);
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
                                    <td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                                            <Search size={32} style={{ opacity: 0.3 }} />
                                            <span>Không tìm thấy Invoice MCC nào phù hợp</span>
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
                                <h3 className="modal-title">
                                    {selectedInvoiceMCC ? 'Cập nhật Invoice MCC' : 'Thêm Invoice MCC mới'}
                                </h3>
                                <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
                            </div>
                            <form onSubmit={handleSubmit}>
                                <div className="modal-body">
                                    <div className="form-group">
                                        <label className="form-label">Tên MI *</label>
                                        <input
                                            name="name"
                                            type="text"
                                            className="form-input"
                                            defaultValue={selectedInvoiceMCC?.name}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">MCC Invoice ID *</label>
                                        <input
                                            name="mccInvoiceId"
                                            type="text"
                                            className="form-input"
                                            placeholder="xxx-xxx-xxxx"
                                            defaultValue={selectedInvoiceMCC?.mccInvoiceId}
                                            disabled={!!selectedInvoiceMCC}
                                            required={!selectedInvoiceMCC}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Đối tác</label>
                                        <select
                                            name="partnerId"
                                            className="form-select"
                                            defaultValue={selectedInvoiceMCC?.partner?.id || selectedInvoiceMCC?.partnerId || ''}
                                        >
                                            <option value="">-- Chọn đối tác --</option>
                                            {partners.map((p: Partner) => (
                                                <option key={p.id} value={p.id}>{p.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {selectedInvoiceMCC && (
                                        <>
                                            <div className="form-group">
                                                <label className="form-label">Trạng thái</label>
                                                <select
                                                    name="status"
                                                    className="form-select"
                                                    defaultValue={selectedInvoiceMCC.status}
                                                >
                                                    <option value="ACTIVE">Hoạt động</option>
                                                    <option value="PENDING">Chờ kết nối</option>
                                                    <option value="EXHAUSTED">Hết tín dụng</option>
                                                    <option value="INACTIVE">Không hoạt động</option>
                                                </select>
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Tín dụng</label>
                                                <select
                                                    name="creditStatus"
                                                    className="form-select"
                                                    defaultValue={selectedInvoiceMCC.creditStatus}
                                                >
                                                    <option value="PENDING">Chờ kết nối</option>
                                                    <option value="CONNECTED">Đã kết nối</option>
                                                    <option value="FAILED">Lỗi</option>
                                                </select>
                                            </div>
                                        </>
                                    )}
                                    <div className="form-group">
                                        <label className="form-label">Ghi chú</label>
                                        <textarea
                                            name="notes"
                                            className="form-input"
                                            rows={3}
                                            defaultValue={selectedInvoiceMCC?.notes || ''}
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
                                        {createMutation.isPending || updateMutation.isPending ? 'Đang xử lý...' : (selectedInvoiceMCC ? 'Cập nhật' : 'Tạo MI')}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {
                deleteId && (
                    <div className="modal-overlay" onClick={() => setDeleteId(null)}>
                        <div className="modal" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3 className="modal-title">Xác nhận xóa</h3>
                                <button className="modal-close" onClick={() => setDeleteId(null)}>×</button>
                            </div>
                            <div className="modal-body">
                                <p>Bạn có chắc chắn muốn xóa Invoice MCC này không? Hành động này không thể hoàn tác.</p>
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
                    <div className={`toast toast - ${toast.type} `}>
                        {toast.type === 'success' ? '✓' : '✕'} {toast.message}
                    </div>
                )
            }
        </div >
    );
}
