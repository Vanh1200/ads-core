import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Layers, FileText, Users, Database, TrendingUp, Activity, ArrowRight, Calendar } from 'lucide-react';
import { spendingApi, statsApi } from '../api/client';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import CustomChartTooltip from '../components/ChartTooltip';
import { StatCardSkeleton, ChartSkeleton, TableSkeleton } from '../components/Skeleton';

interface ActivityLog {
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    description: string | null;
    createdAt: string;
    user: { fullName: string; email: string };
}

export default function Dashboard() {
    const navigate = useNavigate();
    const [dateRange, setDateRange] = useState('30'); // days

    // Date range calculation for chart
    const endDate = new Date().toISOString().split('T')[0];
    const startDateDate = new Date();
    startDateDate.setDate(startDateDate.getDate() - parseInt(dateRange));
    const startDate = startDateDate.toISOString().split('T')[0];

    const { data: summary, isLoading: isSummaryLoading } = useQuery({
        queryKey: ['statsSummary'],
        queryFn: () => statsApi.getSummary(),
    });

    const { data: topSpenders, isLoading: isTopSpendersLoading } = useQuery({
        queryKey: ['topSpenders'],
        queryFn: () => statsApi.getTopSpenders(5),
    });

    const { data: chartData, isLoading: isChartLoading } = useQuery({
        queryKey: ['globalChart', startDate, endDate],
        queryFn: () => spendingApi.getGlobalChart(startDate, endDate),
    });

    const { data: activityLogs, isLoading: isActivityLoading } = useQuery({
        queryKey: ['activityLogs'],
        queryFn: () => statsApi.getRecentActivity(10),
    });



    const stats = [
        {
            icon: Layers,
            value: summary?.data?.batches || 0,
            label: 'Lô tài khoản (MA)',
            color: 'primary',
            path: '/batches',
        },
        {
            icon: FileText,
            value: summary?.data?.invoiceMCCs || 0,
            label: 'Invoice MCC (MI)',
            color: 'secondary',
            path: '/invoice-mccs',
        },
        {
            icon: Users,
            value: summary?.data?.customers || 0,
            label: 'Khách hàng (MC)',
            color: 'warning',
            path: '/customers',
        },
        {
            icon: Database,
            value: summary?.data?.accounts || 0,
            label: 'Tài khoản',
            color: 'danger',
            path: '/accounts',
        },
    ];

    const actionLabels: Record<string, { label: string; class: string }> = {
        CREATE: { label: 'Tạo mới', class: 'success' },
        UPDATE: { label: 'Cập nhật', class: 'info' },
        DELETE: { label: 'Xóa', class: 'danger' },
        LINK_MI: { label: 'Gán MI', class: 'info' },
        UNLINK_MI: { label: 'Gỡ MI', class: 'warning' },
        ASSIGN_MC: { label: 'Giao MC', class: 'info' },
        UNASSIGN_MC: { label: 'Hủy giao MC', class: 'warning' },
        IMPORT: { label: 'Import', class: 'success' },
        SNAPSHOT: { label: 'Snapshot', class: 'info' },
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        if (diff < 24 * 60 * 60 * 1000) {
            return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        }
        return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    };

    const formatCurrency = (amount: number, currency: string = 'USD') => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Dashboard</h1>
                    <p className="page-subtitle">Tổng quan hệ thống quản lý tài khoản Google Ads</p>
                </div>
            </div>

            <div className="stats-grid">
                {isSummaryLoading ? (
                    Array(4).fill(0).map((_, i) => <StatCardSkeleton key={i} />)
                ) : (
                    stats.map((stat, index) => (
                        <div
                            key={index}
                            className="stat-card"
                            onClick={() => stat.path && navigate(stat.path)}
                            style={{ cursor: stat.path ? 'pointer' : 'default', transition: 'transform 0.2s, box-shadow 0.2s' }}
                        >
                            <div className={`stat-icon ${stat.color}`}>
                                <stat.icon size={24} />
                            </div>
                            <div>
                                <div className="stat-value">{stat.value}</div>
                                <div className="stat-label">{stat.label}</div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="dashboard-main-grid">
                {/* Global Spending Chart */}
                {isChartLoading ? (
                    <ChartSkeleton />
                ) : (
                    <div className="card">
                        <div className="card-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <TrendingUp size={20} className="text-primary" />
                                <h3 className="card-title">Tổng chi phí</h3>
                            </div>
                            <div className="flex items-center gap-2">
                                <Calendar size={16} className="text-muted" />
                                <select
                                    className="form-select"
                                    style={{ width: 'auto', padding: '4px 8px', fontSize: '13px' }}
                                    value={dateRange}
                                    onChange={(e) => setDateRange(e.target.value)}
                                >
                                    <option value="7">7 ngày qua</option>
                                    <option value="14">14 ngày qua</option>
                                    <option value="30">30 ngày qua</option>
                                    <option value="60">60 ngày qua</option>
                                    <option value="90">90 ngày qua</option>
                                </select>
                            </div>
                        </div>
                        <div className="card-body">
                            <div style={{ marginBottom: 16 }}>
                                <span className="text-2xl font-bold" style={{ fontSize: '24px', fontWeight: 700 }}>
                                    {formatCurrency(chartData?.data?.totalAmount || 0)}
                                </span>
                                <span className="text-muted" style={{ marginLeft: 8, fontSize: '14px' }}>
                                    (Tổng chi tiêu)
                                </span>
                            </div>
                            <div style={{ width: '100%', height: 300 }}>
                                <ResponsiveContainer>
                                    <AreaChart data={(() => {
                                        if (!chartData?.data?.data) return [];
                                        const rawData = chartData.data.data;
                                        const map = new Map();
                                        rawData.forEach((item: any) => {
                                            const d = new Date(item.date).toISOString().split('T')[0];
                                            map.set(d, item.amount);
                                        });

                                        const result = [];
                                        const curr = new Date(startDate);
                                        const end = new Date(endDate);
                                        while (curr <= end) {
                                            const dStr = curr.toISOString().split('T')[0];
                                            result.push({
                                                date: dStr,
                                                amount: map.get(dStr) || 0
                                            });
                                            curr.setDate(curr.getDate() + 1);
                                        }
                                        return result;
                                    })()}>
                                        <defs>
                                            <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1} />
                                                <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                        <XAxis
                                            dataKey="date"
                                            tickFormatter={(date) => {
                                                const d = new Date(date);
                                                return `${d.getDate()}/${d.getMonth() + 1}`;
                                            }}
                                            tick={{ fontSize: 12, fill: '#6b7280' }}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <YAxis
                                            tickFormatter={(val) => `$${val / 1000}k`}
                                            tick={{ fontSize: 12, fill: '#6b7280' }}
                                            axisLine={false}
                                            tickLine={false}
                                            width={40}
                                        />
                                        <Tooltip content={<CustomChartTooltip />} />
                                        <Area
                                            type="monotone"
                                            dataKey="amount"
                                            stroke="#4f46e5"
                                            strokeWidth={2}
                                            fillOpacity={1}
                                            fill="url(#colorAmount)"
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                )}

                {/* Top 5 Spenders */}
                {isTopSpendersLoading ? (
                    <TableSkeleton />
                ) : (
                    <div className="card">
                        <div className="card-header" onClick={() => {
                            const topIds = topSpenders?.data?.map((a: any) => a.googleAccountId).join('\n');
                            navigate(`/accounts?ids=${encodeURIComponent(topIds || '')}`);
                        }} style={{ cursor: 'pointer' }}>
                            <h3 className="card-title">Top 5 Chi tiêu</h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--primary)' }}>
                                Xem tất cả <ArrowRight size={14} />
                            </div>
                        </div>
                        <div className="card-body" style={{ padding: 0 }}>
                            {topSpenders?.data && topSpenders.data.length > 0 ? (
                                <div className="list-group">
                                    {topSpenders.data.map((account: any, index: number) => (
                                        <div
                                            key={account.id}
                                            className="list-group-item"
                                            onClick={() => navigate(`/accounts/${account.id}`)}
                                            style={{
                                                padding: '12px 16px',
                                                borderBottom: '1px solid var(--border)',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 12,
                                            }}
                                        >
                                            <div style={{
                                                width: 24, height: 24, borderRadius: '50%',
                                                background: index < 3 ? 'var(--primary-light)' : '#f3f4f6',
                                                color: index < 3 ? 'var(--primary)' : '#6b7280',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontWeight: 700, fontSize: 12
                                            }}>
                                                {index + 1}
                                            </div>
                                            <div style={{ flex: 1, overflow: 'hidden' }}>
                                                <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {account.accountName}
                                                </div>
                                                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                                    {account.googleAccountId}
                                                </div>
                                            </div>
                                            <div style={{ fontWeight: 600, color: '#059669' }}>
                                                {formatCurrency(Number(account.totalSpending || 0), account.currency)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="empty-state">
                                    <Database />
                                    <p>Chưa có dữ liệu chi tiêu.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>



            {/* Activity Log - Full Width & Filtered */}
            {isActivityLoading ? (
                <TableSkeleton />
            ) : (
                <div className="card">
                    <div className="card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Activity size={20} className="text-primary" />
                            <h3 className="card-title">Nhật ký hoạt động</h3>
                        </div>
                        <div className="flex items-center gap-2">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--primary)', cursor: 'pointer', marginLeft: 16 }} onClick={() => navigate('/activity-logs')}>
                                Xem tất cả <ArrowRight size={14} />
                            </div>
                        </div>
                    </div>
                    <div className="card-body" style={{ padding: 0 }}>
                        {activityLogs?.data && activityLogs.data.length > 0 ? (
                            <div className="table-container">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: '150px' }}>Thời gian</th>
                                            <th style={{ width: '150px' }}>Người dùng</th>
                                            <th style={{ width: '120px' }}>Hành động</th>
                                            <th>Mô tả</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {activityLogs.data.map((log: ActivityLog) => (
                                            <tr key={log.id} onClick={() => navigate(`/activity-logs?id=${log.id}`)} style={{ cursor: 'pointer' }}>
                                                <td style={{ color: 'var(--text-muted)' }}>{formatDate(log.createdAt)}</td>
                                                <td style={{ fontWeight: 500 }}>{log.user?.fullName}</td>
                                                <td>
                                                    <span className={`badge badge-${actionLabels[log.action]?.class || 'secondary'}`}>
                                                        {actionLabels[log.action]?.label || log.action}
                                                    </span>
                                                </td>
                                                <td>{log.description}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="empty-state">
                                <Activity />
                                <p>Không tìm thấy hoạt động nào.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
