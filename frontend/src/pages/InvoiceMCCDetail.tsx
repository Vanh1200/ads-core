import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, User, DollarSign, FileText, List, Activity, Clock, CheckCircle, AlertCircle, Copy } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { invoiceMCCsApi, activityLogsApi, spendingApi } from '../api/client';
import CustomChartTooltip from '../components/ChartTooltip';

type DateRange = '0' | '1' | '7' | '14' | '30' | 'custom';

export default function InvoiceMCCDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'info' | 'spending'>('info');
    const [dateRange, setDateRange] = useState<DateRange>('1');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [accountIdList, setAccountIdList] = useState('');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const { data: miData, isLoading: isLoadingMi, error: miError } = useQuery({
        queryKey: ['invoice-mcc', id],
        queryFn: () => invoiceMCCsApi.get(id!).then(res => res.data),
        enabled: !!id,
    });

    // Calculate date range for chart
    const getDateRange = () => {
        if (dateRange === 'custom' && customStartDate && customEndDate) {
            return { startDate: customStartDate, endDate: customEndDate };
        }
        const end = new Date();
        const start = new Date();
        const days = parseInt(dateRange);
        if (!isNaN(days)) {
            start.setDate(end.getDate() - days);
        } else {
            // Default or fallback for 'custom' when no dates set
            start.setDate(end.getDate() - 7);
        }
        return {
            startDate: start.toISOString().split('T')[0],
            endDate: end.toISOString().split('T')[0],
        };
    };

    const { startDate, endDate } = getDateRange();

    const { data: spendingData, isLoading: isSpendingLoading } = useQuery({
        queryKey: ['miSpending', id, startDate, endDate],
        queryFn: () => spendingApi.getInvoiceMCCSummary(id!, startDate, endDate).then(res => res.data),
        enabled: !!id && activeTab === 'spending',
    });

    const { data: activityData } = useQuery({
        queryKey: ['miActivities', id],
        queryFn: () => activityLogsApi.getEntityLogs('InvoiceMCC', id!),
        enabled: !!id && activeTab === 'info',
    });

    const { data: accountWiseData, isLoading: isAccountWiseLoading } = useQuery({
        queryKey: ['miAccountSpending', id, startDate, endDate],
        queryFn: () => spendingApi.getAccountWiseSpending('invoice-mcc', id!, startDate, endDate).then(res => res.data),
        enabled: !!id && activeTab === 'spending',
    });

    const mi = miData;

    // Process chart data (fill missing dates)
    const processedChartData = (() => {
        if (!startDate || !endDate || !spendingData?.dailySpending) return [];

        const map = new Map<string, number>();
        spendingData.dailySpending.forEach((item: any) => {
            const dateStr = new Date(item.spendingDate).toISOString().split('T')[0];
            map.set(dateStr, Number(item._sum.amount || 0));
        });

        const result = [];
        const curr = new Date(startDate);
        const end = new Date(endDate);

        while (curr <= end) {
            const dateStr = curr.toISOString().split('T')[0];
            result.push({
                date: dateStr,
                amount: map.get(dateStr) || 0
            });
            curr.setDate(curr.getDate() + 1);
        }

        return result;
    })();

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('vi-VN', {
            style: 'decimal',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount);
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('vi-VN');
    };

    const formatDateTime = (dateStr: string) => {
        return new Date(dateStr).toLocaleString('vi-VN');
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        showToast('Đã copy vào bộ nhớ tạm', 'success');
    };

    const getOrderedAccounts = () => {
        if (!accountWiseData) return [];
        
        const filterIds = accountIdList.split('\n')
            .map(id => id.trim())
            .filter(id => id.length > 0);

        if (filterIds.length === 0) {
            // Default: show accounts with spending > 0
            return accountWiseData.filter((a: any) => a.totalAmount > 0);
        }

        // Ordered by filterIds
        const dataMap = new Map<string, any>(accountWiseData.map((a: any) => [a.googleAccountId, a]));
        return filterIds.map(gid => {
            const existing = dataMap.get(gid);
            return existing || {
                googleAccountId: gid,
                accountName: 'Chưa có dữ liệu',
                totalAmount: 0
            };
        });
    };

    const orderedAccounts = getOrderedAccounts();

    if (isLoadingMi) {
        return (
            <div className="loading-container">
                <div className="spinner"></div>
            </div>
        );
    }

    if (miError || !mi) {
        return (
            <div className="card">
                <div className="card-body" style={{ textAlign: 'center', padding: '40px' }}>
                    <p>Không tìm thấy Invoice MCC</p>
                    <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/invoice-mccs')}>
                        Quay lại danh sách
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div>
            {/* Header */}
            <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button
                        className="btn btn-secondary"
                        style={{ padding: '8px' }}
                        onClick={() => navigate('/invoice-mccs')}
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="page-title">{mi.name}</h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>ID: {mi.id}</span>
                            <span className={`badge badge-${mi.status === 'ACTIVE' ? 'success' : 'danger'}`}>
                                {mi.status === 'ACTIVE' ? 'Hoạt động' : 'Không hoạt động'}
                            </span>
                        </div>
                    </div>
                </div>

                <a
                    href={`/accounts?miId=${mi.id}`}
                    className="btn btn-primary"
                    onClick={(e) => {
                        if (!e.ctrlKey && !e.metaKey) {
                            e.preventDefault();
                            navigate(`/accounts?miId=${mi.id}`);
                        }
                    }}
                >
                    <List size={16} style={{ marginRight: 8 }} />
                    Xem danh sách tài khoản
                </a>
            </div>

            {/* Tabs */}
            <div className="card" style={{ width: '100%', marginBottom: 24 }}>
                <div className="card-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            className={`btn ${activeTab === 'info' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setActiveTab('info')}
                        >
                            <User size={18} style={{ marginRight: 8 }} />
                            Thông tin
                        </button>
                        <button
                            className={`btn ${activeTab === 'spending' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setActiveTab('spending')}
                        >
                            <DollarSign size={18} style={{ marginRight: 8 }} />
                            Chi tiêu
                        </button>
                    </div>
                </div>

                <div className="card-body">
                    {activeTab === 'info' && (
                        <div>
                            {/* Information Grid */}
                            {/* Information Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', width: '100%' }}>
                                <div className="info-card">
                                    <div className="info-card-icon">
                                        <FileText size={20} />
                                    </div>
                                    <div>
                                        <div className="info-card-label">Invoice ID</div>
                                        <div className="info-card-value">{mi.mccInvoiceId || '-'}</div>
                                    </div>
                                </div>

                                <div className="info-card">
                                    <div className="info-card-icon">
                                        <DollarSign size={20} />
                                    </div>
                                    <div>
                                        <div className="info-card-label">Tín dụng</div>
                                        <div>
                                            <span className={`badge badge-${mi.creditStatus === 'CONNECTED' ? 'success' : 'warning'}`} style={{ marginTop: 4 }}>
                                                {mi.creditStatus === 'CONNECTED' ? 'Đã kết nối' : mi.creditStatus}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="info-card">
                                    <div className="info-card-icon">
                                        <User size={20} />
                                    </div>
                                    <div>
                                        <div className="info-card-label">Đối tác</div>
                                        <div className="info-card-value">
                                            {mi.partner ? (
                                                <a
                                                    href={`/partners?search=${mi.partner?.name}`}
                                                    className="link"
                                                    onClick={(e) => {
                                                        if (!e.ctrlKey && !e.metaKey) {
                                                            e.preventDefault();
                                                            navigate(`/partners?search=${mi.partner?.name}`);
                                                        }
                                                    }}
                                                    style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 500, textDecoration: 'none' }}
                                                >
                                                    {mi.partner.name}
                                                </a>
                                            ) : '-'}
                                        </div>
                                    </div>
                                </div>

                                <div className="info-card">
                                    <div className="info-card-icon">
                                        <List size={20} />
                                    </div>
                                    <div>
                                        <div className="info-card-label">Đã liên kết</div>
                                        <div className="info-card-value">
                                            <a
                                                href={`/accounts?miId=${mi.id}`}
                                                className="link"
                                                onClick={(e) => {
                                                    if (!e.ctrlKey && !e.metaKey) {
                                                        e.preventDefault();
                                                        navigate(`/accounts?miId=${mi.id}`);
                                                    }
                                                }}
                                                style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 500, textDecoration: 'none' }}
                                            >
                                                {mi.linkedAccountsCount || 0}
                                            </a>
                                        </div>
                                    </div>
                                </div>

                                <div className="info-card">
                                    <div className="info-card-icon">
                                        <Activity size={20} />
                                    </div>
                                    <div>
                                        <div className="info-card-label">Đang hoạt động</div>
                                        <div className="info-card-value" style={{ color: 'var(--success)' }}>
                                            <a
                                                href={`/accounts?miId=${mi.id}&status=ACTIVE`}
                                                className="link"
                                                onClick={(e) => {
                                                    if (!e.ctrlKey && !e.metaKey) {
                                                        e.preventDefault();
                                                        navigate(`/accounts?miId=${mi.id}&status=ACTIVE`);
                                                    }
                                                }}
                                                style={{ color: 'var(--secondary)', cursor: 'pointer', fontWeight: 500, textDecoration: 'none' }}
                                            >
                                                {mi.activeAccountsCount || 0}
                                            </a>
                                        </div>
                                    </div>
                                </div>

                                <div className="info-card">
                                    <div className="info-card-icon">
                                        <Clock size={20} />
                                    </div>
                                    <div>
                                        <div className="info-card-label">Ngày tạo</div>
                                        <div className="info-card-value">{formatDate(mi.createdAt)}</div>
                                    </div>
                                </div>

                                <div className="info-card">
                                    <div className="info-card-icon">
                                        <Clock size={20} />
                                    </div>
                                    <div>
                                        <div className="info-card-label">Cập nhật lần cuối</div>
                                        <div className="info-card-value">
                                            {mi.updatedAt ? formatDateTime(mi.updatedAt) : formatDateTime(mi.createdAt)}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Activity Logs */}
                            <div style={{ marginTop: '32px' }}>
                                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                    <Activity size={20} />
                                    Lịch sử hoạt động
                                </h3>
                                {(activityData?.data?.length || 0) > 0 ? (
                                    <div className="activity-timeline">
                                        {(activityData?.data || []).slice(0, 10).map((log: {
                                            id: string;
                                            action: string;
                                            description: string;
                                            createdAt: string;
                                            user: { fullName: string };
                                        }) => (
                                            <div key={log.id} className="activity-item">
                                                <div className="activity-dot"></div>
                                                <div className="activity-content">
                                                    <div className="activity-action">{log.description || log.action}</div>
                                                    <div className="activity-meta">
                                                        {log.user?.fullName} • {formatDateTime(log.createdAt)}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p style={{ color: 'var(--text-muted)' }}>Chưa có hoạt động nào</p>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'spending' && (
                        <div>
                            {/* Date Range Selector */}
                            <div style={{ marginBottom: '24px' }}>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                    {(['0', '1', '7', '14', '30'] as DateRange[]).map((range) => (
                                        <button
                                            key={range}
                                            className={`btn btn-sm ${dateRange === range ? 'btn-primary' : 'btn-secondary'}`}
                                            onClick={() => setDateRange(range)}
                                        >
                                            {range === '0' ? 'Hôm nay' : range === '1' ? 'Hôm qua' : `${range} ngày`}
                                        </button>
                                    ))}
                                    <button
                                        className={`btn btn-sm ${dateRange === 'custom' ? 'btn-primary' : 'btn-secondary'}`}
                                        onClick={() => setDateRange('custom')}
                                    >
                                        Tuỳ chỉnh
                                    </button>

                                    {dateRange === 'custom' && (
                                        <>
                                            <input
                                                type="date"
                                                className="form-input"
                                                style={{ width: 'auto', padding: '6px 12px', fontSize: '13px' }}
                                                value={customStartDate}
                                                onChange={(e) => setCustomStartDate(e.target.value)}
                                            />
                                            <span style={{ color: 'var(--text-muted)' }}>đến</span>
                                            <input
                                                type="date"
                                                className="form-input"
                                                style={{ width: 'auto', padding: '6px 12px', fontSize: '13px' }}
                                                value={customEndDate}
                                                onChange={(e) => setCustomEndDate(e.target.value)}
                                            />
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Account List Input */}
                            <div style={{ marginBottom: '24px' }}>
                                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>
                                    Thứ tự / Lọc theo ID tài khoản (Mỗi dòng 1 ID):
                                </label>
                                <textarea
                                    style={{
                                        width: '100%',
                                        padding: '12px',
                                        background: 'var(--bg-secondary)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: 'var(--radius-sm)',
                                        color: 'var(--text-primary)',
                                        fontFamily: 'monospace',
                                        fontSize: '13px',
                                        minHeight: '120px'
                                    }}
                                    placeholder="Ví dụ:&#10;123-456-7890&#10;098-765-4321"
                                    value={accountIdList}
                                    onChange={(e) => setAccountIdList(e.target.value)}
                                />
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                    Nếu để trống, sẽ hiển thị tất cả các tài khoản có phát sinh chi tiêu.
                                </div>
                            </div>

                            {/* Summary & Chart */}
                            <div style={{ marginBottom: '32px' }}>
                                {/* Summary */}
                                <div style={{
                                    padding: '20px',
                                    background: 'var(--bg-secondary)',
                                    borderRadius: 'var(--radius-sm)',
                                    marginBottom: '20px',
                                }}>
                                    <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                                        Tổng chi tiêu trong khoảng ({startDate} đến {endDate})
                                    </div>
                                    <div style={{ fontSize: '32px', fontWeight: 600, color: 'var(--secondary)' }}>
                                        ${formatCurrency(spendingData?.totalSpending || 0)}
                                    </div>
                                </div>

                                {/* Chart - Full Width */}
                                <div style={{
                                    padding: '20px',
                                    background: 'var(--bg-secondary)',
                                    borderRadius: 'var(--radius-sm)',
                                }}>
                                    {isSpendingLoading ? (
                                        <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <div className="spinner"></div>
                                        </div>
                                    ) : processedChartData.length > 0 ? (
                                        <div style={{ height: '300px' }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={processedChartData}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                                                    <XAxis
                                                        dataKey="date"
                                                        tickFormatter={(value) => formatDate(String(value)).split('/')[0] + '/' + formatDate(String(value)).split('/')[1]}
                                                        stroke="var(--text-muted)"
                                                        fontSize={11}
                                                    />
                                                    <YAxis
                                                        tickFormatter={(value) => `$${value}`}
                                                        stroke="var(--text-muted)"
                                                        fontSize={11}
                                                    />
                                                    <Tooltip content={<CustomChartTooltip />} />
                                                    <Line
                                                        type="monotone"
                                                        dataKey="amount"
                                                        stroke="var(--secondary)"
                                                        strokeWidth={2}
                                                        dot={{ r: 3 }}
                                                        activeDot={{ r: 5 }}
                                                    />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>
                                    ) : (
                                        <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                                            Chưa có dữ liệu biểu đồ
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Account Breakdown Table */}
                            <div style={{ marginTop: '32px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '16px' }}>
                                    <h4 style={{ margin: 0 }}>Chi tiết theo tài khoản</h4>
                                    <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                                        Hiển thị {orderedAccounts.length} tài khoản
                                    </div>
                                </div>

                                <div className="table-container">
                                    <table className="data-table" style={{ width: '100%' }}>
                                        <thead>
                                            <tr>
                                                <th 
                                                    style={{ width: '50%', cursor: 'pointer' }}
                                                    onClick={() => copyToClipboard(orderedAccounts.map((a: any) => a.accountName).join('\n'))}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        Tên tài khoản
                                                        <Copy size={14} style={{ color: 'var(--text-muted)' }} />
                                                    </div>
                                                </th>
                                                <th 
                                                    style={{ width: '25%', cursor: 'pointer' }}
                                                    onClick={() => copyToClipboard(orderedAccounts.map((a: any) => a.googleAccountId).join('\n'))}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        ID tài khoản
                                                        <Copy size={14} style={{ color: 'var(--text-muted)' }} />
                                                    </div>
                                                </th>
                                                <th 
                                                    style={{ width: '25%', textAlign: 'right', cursor: 'pointer' }}
                                                    onClick={() => copyToClipboard(orderedAccounts.map((a: any) => a.totalAmount.toFixed(2).replace('.', ',')).join('\n'))}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                                                        Tổng chi tiêu
                                                        <Copy size={14} style={{ color: 'var(--text-muted)' }} />
                                                    </div>
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {isAccountWiseLoading ? (
                                                <tr>
                                                    <td colSpan={3} style={{ textAlign: 'center', padding: '40px' }}>
                                                        <div className="spinner" style={{ margin: '0 auto' }}></div>
                                                    </td>
                                                </tr>
                                            ) : orderedAccounts.length > 0 ? (
                                                orderedAccounts.map((acc: any, idx: number) => (
                                                    <tr key={acc.id || `acc-${idx}`}>
                                                        <td>{acc.accountName}</td>
                                                        <td style={{ fontFamily: 'monospace', fontSize: '13px' }}>{acc.googleAccountId}</td>
                                                        <td style={{ textAlign: 'right', fontWeight: 600, color: acc.totalAmount > 0 ? 'var(--secondary)' : 'var(--text-muted)' }}>
                                                            ${formatCurrency(acc.totalAmount)}
                                                        </td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan={3} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                                        Không tìm thấy dữ liệu tài khoản
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            {toast && (
                <div className={`toast toast-${toast.type}`}>
                    {toast.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
                    <span>{toast.message}</span>
                </div>
            )}
        </div>
    );
}
