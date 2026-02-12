import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, User, Briefcase, FileText, Clock } from 'lucide-react';
import { partnersApi, batchesApi, invoiceMCCsApi } from '../api/client';

const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('vi-VN');
};

const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('vi-VN');
};

export default function PartnerDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const { data: partnerData, isLoading: isLoadingPartner, error: partnerError } = useQuery({
        queryKey: ['partner', id],
        queryFn: () => partnersApi.get(id!).then(res => res.data),
        enabled: !!id,
    });

    // We can fetch batches and MIs for this partner
    const { data: batchesData, isLoading: isLoadingBatches } = useQuery({
        queryKey: ['batches', { partnerId: id }],
        queryFn: () => batchesApi.list({ partnerId: id }).then(res => res.data),
        enabled: !!id && (partnerData?.type === 'ACCOUNT_SUPPLIER' || partnerData?.type === 'BOTH'),
    });

    const { data: misData, isLoading: isLoadingMis } = useQuery({
        queryKey: ['invoice-mccs', { partnerId: id }],
        queryFn: () => invoiceMCCsApi.list({ partnerId: id }).then(res => res.data),
        enabled: !!id && (partnerData?.type === 'INVOICE_PROVIDER' || partnerData?.type === 'BOTH'),
    });

    const partner = partnerData;
    const batches = batchesData?.data || [];
    const mis = misData?.data || [];

    if (isLoadingPartner) {
        return (
            <div className="loading-container">
                <div className="spinner"></div>
            </div>
        );
    }

    if (partnerError || !partner) {
        return (
            <div className="card">
                <div className="card-body" style={{ textAlign: 'center', padding: '40px' }}>
                    <p>Không tìm thấy Đối tác</p>
                    <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/partners')}>
                        Quay lại danh sách
                    </button>
                </div>
            </div>
        );
    }

    const typeLabel = {
        'ACCOUNT_SUPPLIER': 'Cung cấp Tài khoản',
        'INVOICE_PROVIDER': 'Cung cấp Invoice',
        'BOTH': 'Cả hai'
    }[partner.type as string] || partner.type;

    return (
        <div>
            {/* Header */}
            <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button
                        className="btn btn-secondary"
                        style={{ padding: '8px' }}
                        onClick={() => navigate('/partners')}
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="page-title">{partner.name}</h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>ID: {partner.id}</span>
                            <span className="badge badge-info">
                                {typeLabel}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Information Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', width: '100%', marginBottom: 24 }}>
                <div className="info-card">
                    <div className="info-card-icon">
                        <User size={20} />
                    </div>
                    <div>
                        <div className="info-card-label">Liên hệ</div>
                        <div className="info-card-value">{partner.contactInfo || '-'}</div>
                    </div>
                </div>

                <div className="info-card">
                    <div className="info-card-icon">
                        <FileText size={20} />
                    </div>
                    <div>
                        <div className="info-card-label">Ghi chú</div>
                        <div className="info-card-value">{partner.notes || '-'}</div>
                    </div>
                </div>

                <div className="info-card">
                    <div className="info-card-icon">
                        <Clock size={20} />
                    </div>
                    <div>
                        <div className="info-card-label">Ngày tạo</div>
                        <div className="info-card-value">{formatDate(partner.createdAt)}</div>
                    </div>
                </div>

                <div className="info-card">
                    <div className="info-card-icon">
                        <Clock size={20} />
                    </div>
                    <div>
                        <div className="info-card-label">Cập nhật lần cuối</div>
                        <div className="info-card-value">
                            {partner.updatedAt ? formatDateTime(partner.updatedAt) : formatDateTime(partner.createdAt)}
                        </div>
                    </div>
                </div>

                {(partner.type === 'ACCOUNT_SUPPLIER' || partner.type === 'BOTH') && (
                    <div className="info-card">
                        <div className="info-card-icon">
                            <Briefcase size={20} />
                        </div>
                        <div>
                            <div className="info-card-label">Tổng số lô</div>
                            <div className="info-card-value">{batches.length}</div>
                        </div>
                    </div>
                )}

                {(partner.type === 'INVOICE_PROVIDER' || partner.type === 'BOTH') && (
                    <div className="info-card">
                        <div className="info-card-icon">
                            <FileText size={20} />
                        </div>
                        <div>
                            <div className="info-card-label">Tổng số MCC</div>
                            <div className="info-card-value">{mis.length}</div>
                        </div>
                    </div>
                )}
            </div>

            {/* Tables for Batches and MIs */}

            {(partner.type === 'ACCOUNT_SUPPLIER' || partner.type === 'BOTH') && (
                <div className="card" style={{ marginBottom: 24 }}>
                    <div className="card-header">
                        <h3>Danh sách Lô tài khoản ({batches.length})</h3>
                    </div>
                    <div className="table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Tên lô</th>
                                    <th>MCC Account</th>
                                    <th>Trạng thái</th>
                                    <th>Tổng tài khoản</th>
                                    <th>Sống</th>
                                </tr>
                            </thead>
                            <tbody>
                                {isLoadingBatches ? (
                                    <tr><td colSpan={5} style={{ textAlign: 'center' }}>Đang tải lô...</td></tr>
                                ) : batches.length === 0 ? (
                                    <tr><td colSpan={5} style={{ textAlign: 'center' }}>Chưa có lô nào</td></tr>
                                ) : (
                                    batches.map((batch: any) => (
                                        <tr
                                            key={batch.id}
                                            onClick={() => navigate(`/batches/${batch.id}`)}
                                            className="clickable-row"
                                        >
                                            <td>{batch.name}</td>
                                            <td>{batch.mccAccountName}</td>
                                            <td>
                                                <span className={`badge badge-${batch.status === 'ACTIVE' ? 'success' : 'danger'}`} style={{ whiteSpace: 'nowrap' }}>
                                                    {batch.status === 'ACTIVE' ? 'Hoạt động' : 'Không hoạt động'}
                                                </span>
                                            </td>
                                            <td>{batch.totalAccounts}</td>
                                            <td style={{ color: 'var(--success)' }}>{batch.liveAccounts || 0}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {(partner.type === 'INVOICE_PROVIDER' || partner.type === 'BOTH') && (
                <div className="card">
                    <div className="card-header">
                        <h3>Danh sách Invoice MCC ({mis.length})</h3>
                    </div>
                    <div className="table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Tên MCC</th>
                                    <th>Invoice ID</th>
                                    <th>Trạng thái</th>
                                    <th>Tín dụng</th>
                                    <th>Link TK</th>
                                </tr>
                            </thead>
                            <tbody>
                                {isLoadingMis ? (
                                    <tr><td colSpan={5} style={{ textAlign: 'center' }}>Đang tải MCC...</td></tr>
                                ) : mis.length === 0 ? (
                                    <tr><td colSpan={5} style={{ textAlign: 'center' }}>Chưa có MCC nào</td></tr>
                                ) : (
                                    mis.map((mi: any) => (
                                        <tr
                                            key={mi.id}
                                            onClick={() => navigate(`/invoice-mccs/${mi.id}`)}
                                            className="clickable-row"
                                        >
                                            <td>{mi.name}</td>
                                            <td>{mi.mccInvoiceId}</td>
                                            <td>
                                                <span className={`badge badge-${mi.status === 'ACTIVE' ? 'success' : 'danger'}`} style={{ whiteSpace: 'nowrap' }}>
                                                    {mi.status === 'ACTIVE' ? 'Hoạt động' : 'Không hoạt động'}
                                                </span>
                                            </td>
                                            <td>{mi.creditStatus}</td>
                                            <td>{mi.linkedAccountsCount}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
