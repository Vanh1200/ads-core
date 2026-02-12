import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, User, DollarSign, Building2, List, Activity, Clock } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { batchesApi, activityLogsApi, spendingApi } from '../api/client';
import CustomChartTooltip from '../components/ChartTooltip';

type DateRange = '7' | '14' | '30' | 'custom';

export default function BatchDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'info' | 'spending'>('info');
    const [dateRange, setDateRange] = useState<DateRange>('7');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');

    const { data: batchData, isLoading: isLoadingBatch, error: batchError } = useQuery({
        queryKey: ['batch', id],
        queryFn: () => batchesApi.get(id!).then(res => res.data),
        enabled: !!id,
    });

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

    const { data: spendingData, isLoading: isSpendingLoading } = useQuery({
        queryKey: ['batchSpending', id, startDate, endDate],
        queryFn: () => spendingApi.getBatchSummary(id!, startDate, endDate).then(res => res.data),
        enabled: !!id && activeTab === 'spending',
    });

    const { data: activityData } = useQuery({
        queryKey: ['batchActivities', id],
        queryFn: () => activityLogsApi.getEntityLogs('AccountBatch', id!),
        enabled: !!id && activeTab === 'info',
    });

    const batch = batchData;

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

    if (isLoadingBatch) {
        return (
            <div className="loading-container">
                <div className="spinner"></div>
            </div>
        );
    }

    if (batchError || !batch) {
        return (
            <div className="card">
                <div className="card-body" style={{ textAlign: 'center', padding: '40px' }}>
                    <p>Không tìm thấy lô tài khoản</p>
                    <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/batches')}>
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
                        onClick={() => navigate('/batches')}
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="page-title">{batch.mccAccountName}</h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>ID: {batch.id}</span>
                            <span className={`badge badge-${batch.status === 'ACTIVE' ? 'success' : 'danger'}`}>
                                {batch.status === 'ACTIVE' ? 'Hoạt động' : 'Không hoạt động'}
                            </span>
                        </div>
                    </div>
                </div>

                <button
                    className="btn btn-primary"
                    onClick={() => navigate(`/accounts?batchId=${batch.id}`)}
                >
                    <List size={16} style={{ marginRight: 8 }} />
                    Xem danh sách tài khoản
                </button>
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
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', width: '100%' }}>
                                <div className="info-card">
                                    <div className="info-card-icon">
                                        <Building2 size={20} />
                                    </div>
                                    <div>
                                        <div className="info-card-label">MCC Account</div>
                                        <div className="info-card-value">{batch.mccAccountName || '-'}</div>
                                    </div>
                                </div>

                                <div className="info-card">
                                    <div className="info-card-icon">
                                        <Building2 size={20} />
                                    </div>
                                    <div>
                                        <div className="info-card-label">MCC ID</div>
                                        <div className="info-card-value">{batch.mccAccountId || '-'}</div>
                                    </div>
                                </div>

                                <div className="info-card">
                                    <div className="info-card-icon">
                                        <User size={20} />
                                    </div>
                                    <div>
                                        <div className="info-card-label">Đối tác</div>
                                        <div className="info-card-value">
                                            {batch.partner ? (
                                                <span
                                                    className="link"
                                                    onClick={() => navigate(`/partners?search=${batch.partner?.name}`)}
                                                    style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 500 }}
                                                >
                                                    {batch.partner.name}
                                                </span>
                                            ) : '-'}
                                        </div>
                                    </div>
                                </div>

                                <div className="info-card">
                                    <div className="info-card-icon">
                                        <List size={20} />
                                    </div>
                                    <div>
                                        <div className="info-card-label">Tổng số tài khoản</div>
                                        <div className="info-card-value">
                                            <span
                                                className="link"
                                                onClick={() => navigate(`/accounts?batchId=${batch.id}`)}
                                                style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 500 }}
                                            >
                                                {batch.totalAccounts}
                                            </span>
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
                                            <span
                                                className="link"
                                                onClick={() => navigate(`/accounts?batchId=${batch.id}&status=ACTIVE`)}
                                                style={{ color: 'var(--secondary)', cursor: 'pointer', fontWeight: 500 }}
                                            >
                                                {batch.liveAccounts || 0}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="info-card">
                                    <div className="info-card-icon">
                                        <Activity size={20} />
                                    </div>
                                    <div>
                                        <div className="info-card-label">Tỷ lệ sống</div>
                                        <div className="info-card-value">
                                            {batch.totalAccounts > 0
                                                ? Math.round(((batch.liveAccounts || 0) / batch.totalAccounts) * 100)
                                                : 0}%
                                        </div>
                                    </div>
                                </div>

                                <div className="info-card">
                                    <div className="info-card-icon">
                                        <Clock size={20} />
                                    </div>
                                    <div>
                                        <div className="info-card-label">Múi giờ</div>
                                        <div className="info-card-value">{batch.timezone || '-'}</div>
                                    </div>
                                </div>

                                <div className="info-card">
                                    <div className="info-card-icon">
                                        <Clock size={20} />
                                    </div>
                                    <div>
                                        <div className="info-card-label">Năm (Year)</div>
                                        <div className="info-card-value">{batch.year || '-'}</div>
                                    </div>
                                </div>

                                <div className="info-card">
                                    <div className="info-card-icon">
                                        <Activity size={20} />
                                    </div>
                                    <div>
                                        <div className="info-card-label">Readiness</div>
                                        <div className="info-card-value">{batch.readiness || 0} / 10</div>
                                    </div>
                                </div>

                                <div className="info-card">
                                    <div className="info-card-icon">
                                        <Clock size={20} />
                                    </div>
                                    <div>
                                        <div className="info-card-label">Ngày tạo</div>
                                        <div className="info-card-value">{formatDate(batch.createdAt)}</div>
                                    </div>
                                </div>

                                <div className="info-card">
                                    <div className="info-card-icon">
                                        <Clock size={20} />
                                    </div>
                                    <div>
                                        <div className="info-card-label">Cập nhật lần cuối</div>
                                        <div className="info-card-value">
                                            {batch.updatedAt ? formatDateTime(batch.updatedAt) : formatDateTime(batch.createdAt)}
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
                                    ${formatCurrency(spendingData?.totalSpending || 0)}
                                </div>
                            </div>

                            {/* Chart */}
                            {isSpendingLoading ? (
                                <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <div className="spinner"></div>
                                </div>
                            ) : processedChartData.length > 0 ? (
                                <div style={{ height: '300px' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={processedChartData}>
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

                            {/* Daily Spending Table */}
                            {processedChartData.length > 0 && (
                                <div style={{ marginTop: '24px' }}>
                                    <h4 style={{ marginBottom: '12px' }}>Chi tiết theo ngày</h4>
                                    <div className="table-container">
                                        <table className="data-table" style={{ width: '100%' }}>
                                            <thead>
                                                <tr>
                                                    <th>Ngày</th>
                                                    <th style={{ textAlign: 'right' }}>Chi tiêu</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {[...processedChartData].reverse().map((row, index) => (
                                                    <tr key={`${row.date}-${index}`}>
                                                        <td>{formatDate(row.date)}</td>
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
