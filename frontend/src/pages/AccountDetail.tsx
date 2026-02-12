import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, User, DollarSign, Building2, FileText, Clock, Activity } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { accountsApi, spendingApi, activityLogsApi } from '../api/client';
import CustomChartTooltip from '../components/ChartTooltip';

interface Account {
    id: string;
    googleAccountId: string;
    accountName: string;
    status: string;
    currency: string;
    totalSpending: number;
    lastSynced: string | null;
    createdAt: string;
    batch: { id: string; mccAccountName: string };
    currentMi: { id: string; name: string } | null;
    currentMc: { id: string; name: string } | null;
}

interface ChartData {
    date: string;
    amount: number;
    miName: string | null;
    mcName: string | null;
    createdAt?: string;
}




type DateRange = '7' | '14' | '30' | 'custom';

export default function AccountDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const [activeTab, setActiveTab] = useState<'info' | 'spending'>('info');

    useEffect(() => {
        sessionStorage.setItem('lastAccountPath', location.pathname);
    }, [location.pathname]);

    const handleBack = () => {
        sessionStorage.removeItem('lastAccountPath');
        navigate('/accounts');
    };
    const [dateRange, setDateRange] = useState<DateRange>('7');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');

    const { data: accountData, isLoading: isAccountLoading } = useQuery({
        queryKey: ['account', id],
        queryFn: () => accountsApi.get(id!),
        enabled: !!id,
    });

    const account: Account | undefined = accountData?.data;

    // Calculate date range for chart
    const getDateRange = () => {
        if (dateRange === 'custom' && customStartDate && customEndDate) {
            return { startDate: customStartDate, endDate: customEndDate };
        }
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - parseInt(dateRange));
        return {
            startDate: start.toISOString().split('T')[0],
            endDate: end.toISOString().split('T')[0],
        };
    };

    const { startDate, endDate } = getDateRange();

    const { data: chartData, isLoading: isChartLoading } = useQuery({
        queryKey: ['accountChart', id, startDate, endDate],
        queryFn: () => spendingApi.getAccountChart(id!, startDate, endDate),
        enabled: !!id && activeTab === 'spending',
    });

    const { data: activityData } = useQuery({
        queryKey: ['accountActivities', id],
        queryFn: () => activityLogsApi.getEntityLogs('Account', id!),
        enabled: !!id && activeTab === 'info',
    });

    // Aggregate data for chart (sum by date and fill missing dates)
    const aggregatedChartData = (() => {
        if (!startDate || !endDate) return [];

        const map = new Map<string, number>();
        if (chartData?.data?.data) {
            (chartData.data.data as ChartData[]).forEach((d: ChartData) => {
                const current = map.get(d.date) || 0;
                map.set(d.date, current + d.amount);
            });
        }

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

    const getStatusBadge = (status: string) => {
        const statusMap: Record<string, { label: string; class: string }> = {
            ACTIVE: { label: 'Hoạt động', class: 'badge-success' },
            SUSPENDED: { label: 'Không hoạt động', class: 'badge-danger' },
        };
        const config = statusMap[status] || { label: status, class: 'badge-default' };
        return (
            <span className={`badge ${config.class}`}>
                {config.label}
            </span>
        );
    };

    if (isAccountLoading) {
        return (
            <div className="loading-container">
                <div className="spinner"></div>
            </div>
        );
    }

    if (!account) {
        return (
            <div className="card">
                <div className="card-body" style={{ textAlign: 'center', padding: '40px' }}>
                    <p>Không tìm thấy tài khoản</p>
                    <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/accounts')}>
                        Quay lại
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div>
            {/* Header */}
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button
                        className="btn btn-secondary"
                        style={{ padding: '8px' }}
                        onClick={handleBack}
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="page-title">{account.accountName}</h1>
                        <p className="page-subtitle" style={{ fontFamily: 'monospace' }}>
                            {account.googleAccountId} {getStatusBadge(account.status)}
                        </p>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="card" style={{ width: '100%' }}>
                <div className="card-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            className={`btn ${activeTab === 'info' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setActiveTab('info')}
                        >
                            <User size={18} />
                            Thông tin
                        </button>
                        <button
                            className={`btn ${activeTab === 'spending' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setActiveTab('spending')}
                        >
                            <DollarSign size={18} />
                            Chi tiêu
                        </button>
                    </div>
                </div>

                <div className="card-body">
                    {activeTab === 'info' && (
                        <div>
                            {/* Account Info Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', width: '100%' }}>
                                <div className="info-card">
                                    <div className="info-card-icon">
                                        <Building2 size={20} />
                                    </div>
                                    <div>
                                        <div className="info-card-label">Lô tài khoản (MA)</div>
                                        <div className="info-card-value">{account.batch.mccAccountName}</div>
                                    </div>
                                </div>

                                <div className="info-card">
                                    <div className="info-card-icon">
                                        <FileText size={20} />
                                    </div>
                                    <div>
                                        <div className="info-card-label">Invoice MCC (MI)</div>
                                        <div className="info-card-value">{account.currentMi?.name || 'Chưa gán'}</div>
                                    </div>
                                </div>

                                <div className="info-card">
                                    <div className="info-card-icon">
                                        <User size={20} />
                                    </div>
                                    <div>
                                        <div className="info-card-label">Khách hàng (MC)</div>
                                        <div className="info-card-value">{account.currentMc?.name || 'Chưa gán'}</div>
                                    </div>
                                </div>

                                <div className="info-card">
                                    <div className="info-card-icon">
                                        <DollarSign size={20} />
                                    </div>
                                    <div>
                                        <div className="info-card-label">Tổng chi tiêu</div>
                                        <div className="info-card-value" style={{ color: 'var(--secondary)' }}>
                                            ${formatCurrency(Number(account.totalSpending))}
                                        </div>
                                    </div>
                                </div>

                                <div className="info-card">
                                    <div className="info-card-icon">
                                        <Clock size={20} />
                                    </div>
                                    <div>
                                        <div className="info-card-label">Lần đồng bộ cuối</div>
                                        <div className="info-card-value">
                                            {account.lastSynced ? formatDateTime(account.lastSynced) : 'Chưa đồng bộ'}
                                        </div>
                                    </div>
                                </div>

                                <div className="info-card">
                                    <div className="info-card-icon">
                                        <Clock size={20} />
                                    </div>
                                    <div>
                                        <div className="info-card-label">Ngày tạo</div>
                                        <div className="info-card-value">{formatDate(account.createdAt)}</div>
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
                                    {(['7', '14', '30'] as DateRange[]).map((range) => (
                                        <button
                                            key={range}
                                            className={`btn btn-sm ${dateRange === range ? 'btn-primary' : 'btn-secondary'}`}
                                            onClick={() => setDateRange(range)}
                                        >
                                            {range} ngày
                                        </button>
                                    ))}
                                    <button
                                        className={`btn btn-sm ${dateRange === 'custom' ? 'btn-primary' : 'btn-secondary'}`}
                                        onClick={() => setDateRange('custom')}
                                    >
                                        Tùy chỉnh
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

                            {/* Total Spending */}
                            <div style={{
                                padding: '20px',
                                background: 'var(--bg-secondary)',
                                borderRadius: 'var(--radius-sm)',
                                marginBottom: '24px',
                            }}>
                                <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                    Tổng chi tiêu ({startDate} - {endDate})
                                </div>
                                <div style={{ fontSize: '28px', fontWeight: 600, color: 'var(--secondary)' }}>
                                    ${formatCurrency(chartData?.data?.totalAmount || 0)}
                                </div>
                            </div>

                            {/* Chart */}
                            {isChartLoading ? (
                                <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <div className="spinner"></div>
                                </div>
                            ) : (chartData?.data?.data?.length || 0) > 0 ? (
                                <div style={{ height: '300px' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={aggregatedChartData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                                            <XAxis
                                                dataKey="date"
                                                tickFormatter={(value) => formatDate(String(value)).split('/')[0] + '/' + formatDate(String(value)).split('/')[1]}
                                                stroke="var(--text-muted)"
                                                fontSize={12}
                                            />
                                            <YAxis
                                                tickFormatter={(value) => `$${value}`}
                                                stroke="var(--text-muted)"
                                                fontSize={12}
                                            />
                                            <Tooltip content={<CustomChartTooltip />} />
                                            <Line
                                                type="monotone"
                                                dataKey="amount"
                                                stroke="var(--secondary)"
                                                strokeWidth={2}
                                                dot={{ r: 4 }}
                                                activeDot={{ r: 6 }}
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : (
                                <div style={{
                                    height: '300px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'var(--text-muted)',
                                }}>
                                    Chưa có dữ liệu chi tiêu trong khoảng thời gian này
                                </div>
                            )}

                            {/* Spending Table */}
                            {(chartData?.data?.data?.length || 0) > 0 && (
                                <div style={{ marginTop: '24px' }}>
                                    <h4 style={{ marginBottom: '12px' }}>Chi tiết</h4>
                                    <div className="table-container">
                                        <table className="data-table">
                                            <thead>
                                                <tr>
                                                    <th style={{ width: '15%' }}>Ngày</th>
                                                    <th style={{ width: '15%' }}>Thời gian</th>
                                                    <th style={{ width: '25%' }}>MI (Invoice MCC)</th>
                                                    <th style={{ width: '25%' }}>MC (Khách hàng)</th>
                                                    <th style={{ width: '20%', textAlign: 'right' }}>Chi tiêu</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(chartData?.data?.data || []).map((row: ChartData, index: number) => (
                                                    <tr key={`${row.date}-${index}`}>
                                                        <td>{formatDate(row.date)}</td>
                                                        <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                                                            {row.createdAt ? new Date(row.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                                                        </td>
                                                        <td style={{ color: row.miName ? 'var(--text)' : 'var(--text-muted)' }}>
                                                            {row.miName || '—'}
                                                        </td>
                                                        <td style={{ color: row.mcName ? 'var(--text)' : 'var(--text-muted)' }}>
                                                            {row.mcName || '—'}
                                                        </td>
                                                        <td style={{ textAlign: 'right', fontWeight: 500, color: 'var(--secondary)' }}>
                                                            ${formatCurrency(row.amount)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
