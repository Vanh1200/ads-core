import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Edit2, Trash2 } from 'lucide-react';
import { partnersApi } from '../api/client';
import { useAuthStore, canManagePartners } from '../store/authStore';

interface Partner {
    id: string;
    name: string;
    contactInfo: string | null;
    type: string;
    notes: string | null;
    _count?: {
        batches: number;
        invoiceMCCs: number;
    };
}

export default function Partners() {
    const { user } = useAuthStore();
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
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
        queryKey: ['partners', search],
        queryFn: () => partnersApi.list({ search }),
    });

    const createMutation = useMutation({
        mutationFn: (data: object) => partnersApi.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['partners'] });
            setShowModal(false);
            showToast('Tạo đối tác thành công', 'success');
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
        mutationFn: ({ id, data }: { id: string; data: object }) => partnersApi.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['partners'] });
            setShowModal(false);
            setSelectedPartner(null);
            showToast('Cập nhật đối tác thành công', 'success');
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
        mutationFn: (id: string) => partnersApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['partners'] });
            setDeleteId(null);
            showToast('Xóa đối tác thành công', 'success');
        },
        onError: (error: any) => {
            setDeleteId(null);
            showToast(error.response?.data?.error || 'Không thể xóa đối tác này', 'error');
        },
    });

    const partners = data?.data?.data || [];

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const data = {
            name: formData.get('name'),
            contactInfo: formData.get('contactInfo') || null,
            type: formData.get('type'),
            notes: formData.get('notes') || null,
        };

        if (selectedPartner) {
            updateMutation.mutate({ id: selectedPartner.id, data });
        } else {
            createMutation.mutate(data);
        }
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Đối tác</h1>
                    <p className="page-subtitle">Quản lý đối tác cung cấp tài khoản và hóa đơn</p>
                </div>
                {canManagePartners(user?.role || 'VIEWER') && (
                    <button
                        className="btn btn-primary"
                        onClick={() => {
                            setSelectedPartner(null);
                            setShowModal(true);
                        }}
                    >
                        <Plus size={18} />
                        Thêm đối tác
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
                            placeholder="Tìm kiếm đối tác..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>
                <div className="table-container">
                    <table className="data-table" style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                <th>Tên đối tác</th>
                                <th>Loại</th>
                                <th>Thông tin liên hệ</th>
                                <th>Ghi chú</th>
                                <th>SL Batch</th>
                                <th>SL MI</th>
                                <th style={{ width: '120px', textAlign: 'right' }}>Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={7} style={{ textAlign: 'center' }}>Đang tải...</td>
                                </tr>
                            ) : partners.length > 0 ? (
                                partners.map((partner: Partner) => (
                                    <tr
                                        key={partner.id}
                                        onClick={() => navigate(`/partners/${partner.id}`)}
                                        className="clickable-row"
                                    >
                                        <td style={{ fontWeight: 500 }}>{partner.name}</td>
                                        <td>
                                            <span className={`badge ${partner.type === 'ACCOUNT_SUPPLIER' ? 'badge-info' :
                                                partner.type === 'INVOICE_PROVIDER' ? 'badge-success' : 'badge-warning'
                                                }`}>
                                                {partner.type === 'ACCOUNT_SUPPLIER' ? 'Cung cấp TK' :
                                                    partner.type === 'INVOICE_PROVIDER' ? 'Cung cấp HĐ' : 'Cả hai'}
                                            </span>
                                        </td>
                                        <td>{partner.contactInfo || '-'}</td>
                                        <td style={{ maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {partner.notes || '-'}
                                        </td>
                                        <td>
                                            <span
                                                className="link"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/batches?partnerId=${partner.id}`);
                                                }}
                                                style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 500 }}
                                            >
                                                {partner._count?.batches || 0}
                                            </span>
                                        </td>
                                        <td>
                                            <span
                                                className="link"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/invoice-mccs?search=${partner.name}`);
                                                }}
                                                style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 500 }}
                                            >
                                                {partner._count?.invoiceMCCs || 0}
                                            </span>
                                        </td>
                                        <td>
                                            {canManagePartners(user?.role || 'VIEWER') && (
                                                <div className="actions" style={{ justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        className="btn-icon"
                                                        title="Chỉnh sửa"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedPartner(partner);
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
                                                            setDeleteId(partner.id);
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
                                        Chưa có đối tác nào
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Create/Edit Modal */}
            {
                showModal && (
                    <div className="modal-overlay" onClick={() => setShowModal(false)}>
                        <div className="modal" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3 className="modal-title">
                                    {selectedPartner ? 'Cập nhật đối tác' : 'Thêm đối tác mới'}
                                </h3>
                                <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
                            </div>
                            <form onSubmit={handleSubmit}>
                                <div className="modal-body">
                                    <div className="form-group">
                                        <label className="form-label">Tên đối tác *</label>
                                        <input
                                            name="name"
                                            type="text"
                                            className="form-input"
                                            placeholder="Nhập tên đối tác"
                                            defaultValue={selectedPartner?.name}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Loại đối tác *</label>
                                        <select
                                            name="type"
                                            className="form-select"
                                            defaultValue={selectedPartner?.type || 'ACCOUNT_SUPPLIER'}
                                        >
                                            <option value="ACCOUNT_SUPPLIER">Cung cấp Tài khoản</option>
                                            <option value="INVOICE_PROVIDER">Cung cấp Hóa đơn</option>
                                            <option value="BOTH">Cả hai</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Thông tin liên hệ</label>
                                        <input
                                            name="contactInfo"
                                            type="text"
                                            className="form-input"
                                            placeholder="Email, SĐT, Telegram..."
                                            defaultValue={selectedPartner?.contactInfo || ''}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Ghi chú</label>
                                        <textarea
                                            name="notes"
                                            className="form-input"
                                            rows={3}
                                            placeholder="Ghi chú thêm..."
                                            defaultValue={selectedPartner?.notes || ''}
                                        />
                                    </div>
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
                                        {createMutation.isPending || updateMutation.isPending ? 'Đang xử lý...' : (selectedPartner ? 'Cập nhật' : 'Thêm mới')}
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
                                <p>Bạn có chắc chắn muốn xóa đối tác này không? Hành động này không thể hoàn tác.</p>
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
