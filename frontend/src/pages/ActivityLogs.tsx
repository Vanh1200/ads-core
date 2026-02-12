import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Filter, X, Clock, User as UserIcon, Shield } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { activityLogsApi, usersApi } from '../api/client';

interface ActivityLog {
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    description: string | null;
    createdAt: string;
    user: { fullName: string; email: string };
    oldValues: any;
    newValues: any;
    ipAddress: string | null;
}

export default function ActivityLogs() {
    const [searchParams, setSearchParams] = useSearchParams();
    const detailId = searchParams.get('id');

    const [entityType, setEntityType] = useState('');
    const [action, setAction] = useState('');
    const [userId, setUserId] = useState('');
    const [page, setPage] = useState(1);

    // Fetch users for filter
    const { data: usersData } = useQuery({
        queryKey: ['users', 'simple'],
        queryFn: () => usersApi.listSimple(),
    });
    const users = usersData?.data || [];

    const { data, isLoading } = useQuery({
        queryKey: ['activityLogs', entityType, action, userId, page],
        queryFn: () => activityLogsApi.list({
            entityType: entityType || undefined,
            action: action || undefined,
            userId: userId || undefined,
            page,
            limit: 30,
        }),
    });

    const logs = data?.data?.data || [];
    const pagination = data?.data?.pagination || { total: 0, totalPages: 1 };

    // Fetch detail if ID is present
    const { data: detailData, isLoading: isLoadingDetail } = useQuery({
        queryKey: ['activityLog', detailId],
        queryFn: () => activityLogsApi.get(detailId!),
        enabled: !!detailId,
    });
    const selectedLog = detailData?.data as ActivityLog | undefined;

    const closeDetail = () => {
        setSearchParams(params => {
            const newParams = new URLSearchParams(params);
            newParams.delete('id');
            return newParams;
        });
    };

    const actionLabels: Record<string, { label: string; class: string }> = {
        CREATE: { label: 'Tạo mới', class: 'success' },
        UPDATE: { label: 'Cập nhật', class: 'info' },
        DELETE: { label: 'Xóa', class: 'danger' },
        LINK_MI: { label: 'Link MI', class: 'info' },
        UNLINK_MI: { label: 'Unlink MI', class: 'warning' },
        ASSIGN_MC: { label: 'Giao MC', class: 'info' },
        UNASSIGN_MC: { label: 'Hủy giao MC', class: 'warning' },
        IMPORT: { label: 'Import', class: 'success' },
        IMPORT_SPENDING: { label: 'Import chi phí', class: 'success' },
        SNAPSHOT: { label: 'Snapshot', class: 'info' },
    };

    const entityTypeLabels: Record<string, string> = {
        User: 'Người dùng',
        Partner: 'Đối tác',
        AccountBatch: 'Lô TK (MA)',
        InvoiceMCC: 'Invoice MCC (MI)',
        Customer: 'Khách hàng (MC)',
        Account: 'Tài khoản',
        SpendingSnapshot: 'Chi phí (Snapshot)',
        SpendingRecord: 'Chi phí (Import)',
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Lịch sử hoạt động</h1>
                    <p className="page-subtitle">Theo dõi tất cả các thay đổi trong hệ thống</p>
                </div>
            </div>

            <div className="card">
                <div className="card-header" style={{ gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <Filter size={18} style={{ color: 'var(--text-muted)' }} />
                        <select
                            className="form-select"
                            style={{ width: 'auto' }}
                            value={userId}
                            onChange={(e) => {
                                setUserId(e.target.value);
                                setPage(1);
                            }}
                        >
                            <option value="">Tất cả người thực hiện</option>
                            {users.map((u: any) => (
                                <option key={u.id} value={u.id}>{u.fullName}</option>
                            ))}
                        </select>
                        <select
                            className="form-select"
                            style={{ width: 'auto' }}
                            value={entityType}
                            onChange={(e) => {
                                setEntityType(e.target.value);
                                setPage(1);
                            }}
                        >
                            <option value="">Tất cả đối tượng</option>
                            <option value="User">Người dùng</option>
                            <option value="AccountBatch">Lô TK (MA)</option>
                            <option value="InvoiceMCC">Invoice MCC (MI)</option>
                            <option value="Customer">Khách hàng (MC)</option>
                            <option value="Account">Tài khoản</option>
                            <option value="SpendingSnapshot">Chi phí (Snapshot)</option>
                            <option value="SpendingRecord">Chi phí (Import)</option>
                        </select>
                        <select
                            className="form-select"
                            style={{ width: 'auto' }}
                            value={action}
                            onChange={(e) => {
                                setAction(e.target.value);
                                setPage(1);
                            }}
                        >
                            <option value="">Tất cả hành động</option>
                            <option value="CREATE">Tạo mới</option>
                            <option value="UPDATE">Cập nhật</option>
                            <option value="DELETE">Xóa</option>
                            <option value="LINK_MI">Link MI</option>
                            <option value="ASSIGN_MC">Giao MC</option>
                            <option value="IMPORT">Import</option>
                            <option value="IMPORT_SPENDING">Import chi phí</option>
                        </select>
                        {(entityType || action || userId) && (
                            <button
                                className="btn btn-secondary"
                                onClick={() => {
                                    setEntityType('');
                                    setAction('');
                                    setUserId('');
                                    setPage(1);
                                }}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, height: 38 }}
                            >
                                <X size={14} />
                                Xóa bộ lọc
                            </button>
                        )}
                    </div>
                </div>
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th style={{ width: '14%' }}>Thời gian</th>
                                <th style={{ width: '16%' }}>Người thực hiện</th>
                                <th style={{ width: '12%' }}>Hành động</th>
                                <th style={{ width: '16%' }}>Đối tượng</th>
                                <th style={{ width: '42%' }}>Mô tả</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={5} style={{ textAlign: 'center' }}>Đang tải...</td>
                                </tr>
                            ) : logs.length > 0 ? (
                                logs.map((log: ActivityLog) => (
                                    <tr
                                        key={log.id}
                                        onClick={() => setSearchParams({ id: log.id })}
                                        style={{ cursor: 'pointer', transition: 'background-color 0.1s' }}
                                        className="hover:bg-gray-50"
                                    >
                                        <td>
                                            <small style={{ color: 'var(--text-muted)' }}>
                                                {formatDate(log.createdAt)}
                                            </small>
                                        </td>
                                        <td>
                                            <div>{log.user?.fullName || 'Unknown'}</div>
                                            <small style={{ color: 'var(--text-muted)' }}>{log.user?.email}</small>
                                        </td>
                                        <td>
                                            <span className={`badge badge - ${actionLabels[log.action]?.class || 'info'} `}>
                                                {actionLabels[log.action]?.label || log.action}
                                            </span>
                                        </td>
                                        <td>
                                            <span>{entityTypeLabels[log.entityType] || log.entityType}</span>
                                            <small style={{ color: 'var(--text-muted)', display: 'block' }}>
                                                ID: {log.entityId.substring(0, 8)}...
                                            </small>
                                        </td>
                                        <td style={{ maxWidth: '300px' }}>
                                            {log.description || '-'}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                                        Không có hoạt động nào
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                {pagination.totalPages > 1 && (
                    <div className="pagination">
                        <button
                            className="pagination-btn"
                            disabled={page <= 1}
                            onClick={() => setPage(page - 1)}
                        >
                            ← Trước
                        </button>
                        <span style={{ color: 'var(--text-muted)' }}>
                            Trang {page} / {pagination.totalPages} ({pagination.total} hoạt động)
                        </span>
                        <button
                            className="pagination-btn"
                            disabled={page >= pagination.totalPages}
                            onClick={() => setPage(page + 1)}
                        >
                            Sau →
                        </button>
                    </div>
                )}
            </div>

            {/* Detail Modal */}
            {detailId && (
                <div className="modal-overlay" onClick={closeDetail}>
                    <div className="modal" style={{ maxWidth: 700 }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Chi tiết hoạt động</h3>
                            <button className="modal-close" onClick={closeDetail}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            {isLoadingDetail ? (
                                <div style={{ padding: 20, textAlign: 'center' }}>Đang tải...</div>
                            ) : selectedLog ? (
                                <div>
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(2, 1fr)',
                                        gap: 16,
                                        marginBottom: 20,
                                        background: 'var(--bg-tertiary)',
                                        padding: 16,
                                        borderRadius: 8
                                    }}>
                                        <div>
                                            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 4 }}>Thời gian</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <Clock size={16} />
                                                <strong>{formatDate(selectedLog.createdAt)}</strong>
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 4 }}>Người thực hiện</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <UserIcon size={16} />
                                                <strong>{selectedLog.user?.fullName}</strong>
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 4 }}>Hành động</div>
                                            <div>
                                                <span className={`badge badge - ${actionLabels[selectedLog.action]?.class || 'secondary'} `}>
                                                    {actionLabels[selectedLog.action]?.label || selectedLog.action}
                                                </span>
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 4 }}>Đối tượng</div>
                                            <div>
                                                <strong>{entityTypeLabels[selectedLog.entityType] || selectedLog.entityType}</strong>
                                                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>ID: {selectedLog.entityId}</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ marginBottom: 20 }}>
                                        <h4 style={{ marginBottom: 8, fontSize: 14 }}>Mô tả</h4>
                                        <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 6 }}>
                                            {selectedLog.description}
                                        </div>
                                    </div>

                                    {!['LINK_MI', 'ASSIGN_MC'].includes(selectedLog.action) && (selectedLog.oldValues || selectedLog.newValues) && (
                                        <div>
                                            <h4 style={{ marginBottom: 12, fontSize: 14 }}>Chi tiết thay đổi</h4>
                                            <div style={{
                                                display: 'grid',
                                                gridTemplateColumns: selectedLog.oldValues ? '1fr 1fr' : '1fr',
                                                gap: 16
                                            }}>
                                                {selectedLog.oldValues && (
                                                    <div>
                                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Giá trị cũ</div>
                                                        <pre style={{
                                                            background: '#fee2e2',
                                                            color: '#991b1b',
                                                            padding: 12,
                                                            borderRadius: 6,
                                                            fontSize: 12,
                                                            overflow: 'auto',
                                                            maxHeight: 300
                                                        }}>
                                                            {JSON.stringify(selectedLog.oldValues, null, 2)}
                                                        </pre>
                                                    </div>
                                                )}
                                                {selectedLog.newValues && (
                                                    <div>
                                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Giá trị mới</div>
                                                        <pre style={{
                                                            background: '#dcfce7',
                                                            color: '#166534',
                                                            padding: 12,
                                                            borderRadius: 6,
                                                            fontSize: 12,
                                                            overflow: 'auto',
                                                            maxHeight: 300
                                                        }}>
                                                            {JSON.stringify(selectedLog.newValues, null, 2)}
                                                        </pre>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {!['LINK_MI', 'ASSIGN_MC'].includes(selectedLog.action) && selectedLog.ipAddress && (
                                        <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <Shield size={12} /> IP Address: {selectedLog.ipAddress}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', color: 'var(--danger)' }}>
                                    Không tìm thấy thông tin hoạt động
                                </div>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={closeDetail}>Đóng</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
