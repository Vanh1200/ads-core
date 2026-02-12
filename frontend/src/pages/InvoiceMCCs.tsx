import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Edit2, Trash2 } from 'lucide-react';
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

export default function InvoiceMCCs() {
    const { user } = useAuthStore();
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [spendingDays, setSpendingDays] = useState(1);
    const [showModal, setShowModal] = useState(false);
    const [selectedInvoiceMCC, setSelectedInvoiceMCC] = useState<InvoiceMCC | null>(null);
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
        queryKey: ['invoiceMCCs', search, spendingDays],
        queryFn: () => invoiceMCCsApi.list({ search, spendingDays }),
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
    const partners = partnersData?.data?.data || [];

    const creditStatusLabels: Record<string, { label: string; class: string }> = {
        PENDING: { label: 'Chờ kết nối', class: 'warning' },
        CONNECTED: { label: 'Đã kết nối', class: 'success' },
        FAILED: { label: 'Lỗi', class: 'danger' },
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

            <div className="card">
                <div className="card-header">
                    <div className="search-input">
                        <Search />
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Tìm kiếm Invoice MCC..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>
                <div className="table-container">
                    <table className="data-table" style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                <th style={{ width: '20%' }}>Tên</th>
                                <th style={{ width: '15%' }}>MCC Invoice ID</th>
                                <th style={{ width: '15%' }}>Trạng thái</th>
                                <th style={{ width: '12%' }}>Tín dụng</th>
                                <th style={{ width: '10%' }}>Tài khoản</th>
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
                                <th style={{ width: '15%' }}>Đối tác</th>
                                <th style={{ width: '120px', textAlign: 'right' }}>Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={8} style={{ textAlign: 'center' }}>Đang tải...</td>
                                </tr>
                            ) : invoiceMCCs.length > 0 ? (
                                invoiceMCCs.map((mi: InvoiceMCC) => (
                                    <tr
                                        key={mi.id}
                                        onClick={() => {
                                            if (window.getSelection()?.toString()) return;
                                            navigate(`/invoice-mccs/${mi.id}`);
                                        }}
                                        style={{ cursor: 'pointer' }}
                                        className="clickable-row"
                                    >
                                        <td><strong>{mi.name}</strong></td>
                                        <td><code>{mi.mccInvoiceId}</code></td>
                                        <td>
                                            <span className={`badge badge-${mi.status === 'ACTIVE' ? 'success' : 'danger'}`} style={{ whiteSpace: 'nowrap' }}>
                                                {mi.status === 'ACTIVE' ? 'Hoạt động' : 'Không hoạt động'}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`badge badge-${creditStatusLabels[mi.creditStatus]?.class || 'info'}`}>
                                                {creditStatusLabels[mi.creditStatus]?.label || mi.creditStatus}
                                            </span>
                                        </td>
                                        <td>
                                            <span
                                                className="link"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/accounts?miId=${mi.id}`);
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
                                                        navigate(`/partners?search=${mi.partner?.name}`);
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
                                    <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                                        Chưa có Invoice MCC nào
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
                                                    <option value="ACTIVE">Hoạt động (Active)</option>
                                                    <option value="INACTIVE">Không hoạt động (Inactive)</option>
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
                    <div className={`toast toast-${toast.type}`}>
                        {toast.type === 'success' ? '✓' : '✕'} {toast.message}
                    </div>
                )
            }
        </div >
    );
}
