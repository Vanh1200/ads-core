import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
    Plug, PlugZap, RefreshCw, Users, Database, Target,
    DollarSign, ChevronRight, AlertCircle,
    Building2, Globe, Clock, Shield, Eye, ArrowLeft
} from 'lucide-react';
import { googleAdsApi } from '../api/client';

type ActiveView = 'overview' | 'customer-detail' | 'campaigns' | 'campaign-detail' | 'spending';

interface ViewState {
    view: ActiveView;
    customerId?: string;
    customerName?: string;
    campaignId?: string;
    campaignName?: string;
}

export default function GoogleAdsExplorer() {
    const queryClient = useQueryClient();
    const [searchParams] = useSearchParams();
    const [viewState, setViewState] = useState<ViewState>({ view: 'overview' });
    const [selectedDateRange, setSelectedDateRange] = useState('LAST_7_DAYS');

    // Check if just connected via OAuth callback
    useEffect(() => {
        if (searchParams.get('connected') === 'true') {
            queryClient.invalidateQueries({ queryKey: ['googleAdsStatus'] });
        }
    }, [searchParams, queryClient]);

    // OAuth status
    const { data: statusData, isLoading: isStatusLoading } = useQuery({
        queryKey: ['googleAdsStatus'],
        queryFn: () => googleAdsApi.getOAuthStatus(),
    });

    const isConnected = statusData?.data?.connected || false;
    const mccId = statusData?.data?.mccId || '';

    // Get OAuth URL
    const connectMutation = useMutation({
        mutationFn: () => googleAdsApi.getOAuthUrl(),
        onSuccess: (response) => {
            window.location.href = response.data.url;
        },
    });

    // Disconnect
    const disconnectMutation = useMutation({
        mutationFn: () => googleAdsApi.disconnect(),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['googleAdsStatus'] });
            queryClient.invalidateQueries({ queryKey: ['googleAds'] });
        },
    });

    // Accessible customers
    const { data: accessibleData, isLoading: isAccessibleLoading } = useQuery({
        queryKey: ['googleAds', 'accessible'],
        queryFn: () => googleAdsApi.getAccessibleCustomers(),
        enabled: isConnected,
    });

    // Customer clients under MCC
    const { data: clientsData, isLoading: isClientsLoading } = useQuery({
        queryKey: ['googleAds', 'clients', mccId],
        queryFn: () => googleAdsApi.getCustomerClients(mccId),
        enabled: isConnected && !!mccId,
    });

    // MCC Info
    const { data: mccInfo, isLoading: isMccInfoLoading } = useQuery({
        queryKey: ['googleAds', 'mccInfo', mccId],
        queryFn: () => googleAdsApi.getCustomerInfo(mccId),
        enabled: isConnected && !!mccId,
    });

    // Customer detail
    const { data: customerDetail, isLoading: isCustomerDetailLoading } = useQuery({
        queryKey: ['googleAds', 'customerInfo', viewState.customerId],
        queryFn: () => googleAdsApi.getCustomerInfo(viewState.customerId!),
        enabled: isConnected && !!viewState.customerId && viewState.view === 'customer-detail',
    });

    // Campaigns
    const { data: campaignsData, isLoading: isCampaignsLoading } = useQuery({
        queryKey: ['googleAds', 'campaigns', viewState.customerId],
        queryFn: () => googleAdsApi.getCampaigns(viewState.customerId!),
        enabled: isConnected && !!viewState.customerId && viewState.view === 'campaigns',
    });

    // Campaign detail
    const { data: campaignDetail, isLoading: isCampaignDetailLoading } = useQuery({
        queryKey: ['googleAds', 'campaignDetail', viewState.customerId, viewState.campaignId],
        queryFn: () => googleAdsApi.getCampaignDetails(viewState.customerId!, viewState.campaignId!),
        enabled: isConnected && !!viewState.customerId && !!viewState.campaignId && viewState.view === 'campaign-detail',
    });

    // Spending
    const { data: spendingData, isLoading: isSpendingLoading } = useQuery({
        queryKey: ['googleAds', 'spending', viewState.customerId, selectedDateRange],
        queryFn: () => googleAdsApi.getSpending(viewState.customerId!, selectedDateRange),
        enabled: isConnected && !!viewState.customerId && viewState.view === 'spending',
    });

    const formatCurrency = (micros: string | number) => {
        const amount = Number(micros) / 1_000_000;
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
    };

    const formatId = (id: string) => {
        const s = String(id);
        if (s.length === 10) return `${s.slice(0, 3)}-${s.slice(3, 6)}-${s.slice(6)}`;
        return s;
    };

    const statusBadge = (status: string) => {
        const map: Record<string, { label: string; cls: string }> = {
            ENABLED: { label: 'Đang chạy', cls: 'badge-success' },
            PAUSED: { label: 'Tạm dừng', cls: 'badge-warning' },
            REMOVED: { label: 'Đã xóa', cls: 'badge-danger' },
            SUSPENDED: { label: 'Bị đình chỉ', cls: 'badge-danger' },
            CLOSED: { label: 'Đã đóng', cls: 'badge-secondary' },
            CANCELLED: { label: 'Đã hủy', cls: 'badge-secondary' },
            UNKNOWN: { label: 'Không rõ', cls: 'badge-secondary' },
        };
        const info = map[status] || { label: status, cls: 'badge-secondary' };
        return <span className={`badge ${info.cls}`}>{info.label}</span>;
    };

    const renderBreadcrumb = () => {
        const crumbs: { label: string; onClick?: () => void }[] = [
            { label: 'Google Ads Explorer', onClick: () => setViewState({ view: 'overview' }) },
        ];

        if (viewState.view !== 'overview') {
            crumbs.push({
                label: viewState.customerName || formatId(viewState.customerId || ''),
                onClick: () => setViewState({
                    view: 'customer-detail',
                    customerId: viewState.customerId,
                    customerName: viewState.customerName,
                }),
            });
        }

        if (viewState.view === 'campaigns') {
            crumbs.push({ label: 'Chiến dịch' });
        } else if (viewState.view === 'campaign-detail') {
            crumbs.push({
                label: 'Chiến dịch',
                onClick: () => setViewState({
                    view: 'campaigns',
                    customerId: viewState.customerId,
                    customerName: viewState.customerName,
                }),
            });
            crumbs.push({ label: viewState.campaignName || viewState.campaignId || '' });
        } else if (viewState.view === 'spending') {
            crumbs.push({ label: 'Chi tiêu' });
        }

        return (
            <div className="gads-breadcrumb">
                {crumbs.map((crumb, i) => (
                    <span key={i} className="gads-breadcrumb-item">
                        {i > 0 && <ChevronRight size={14} />}
                        {crumb.onClick ? (
                            <a onClick={crumb.onClick}>{crumb.label}</a>
                        ) : (
                            <span className="gads-breadcrumb-active">{crumb.label}</span>
                        )}
                    </span>
                ))}
            </div>
        );
    };

    // ===== Render Connection Status =====
    const renderConnectionCard = () => (
        <div className="card gads-connection-card">
            <div className="card-body" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div className={`gads-status-icon ${isConnected ? 'connected' : 'disconnected'}`}>
                            {isConnected ? <PlugZap size={24} /> : <Plug size={24} />}
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
                                {isConnected ? 'Đã kết nối Google Ads' : 'Chưa kết nối Google Ads'}
                            </h3>
                            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                                {isConnected
                                    ? `MCC: ${formatId(mccId)} • Developer Token: Tài khoản thử nghiệm`
                                    : 'Kết nối tài khoản Google để sử dụng API'
                                }
                            </p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {isConnected ? (
                            <button
                                className="btn btn-outline-danger"
                                onClick={() => disconnectMutation.mutate()}
                                disabled={disconnectMutation.isPending}
                            >
                                Ngắt kết nối
                            </button>
                        ) : (
                            <button
                                className="btn btn-primary"
                                onClick={() => connectMutation.mutate()}
                                disabled={connectMutation.isPending}
                                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                            >
                                <Plug size={16} />
                                {connectMutation.isPending ? 'Đang chuyển hướng...' : 'Kết nối Google'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

    // ===== Overview View =====
    const renderOverview = () => (
        <>
            {/* MCC Info */}
            {mccId && (
                <div className="card" style={{ marginBottom: 20 }}>
                    <div className="card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Building2 size={20} className="text-primary" />
                            <h3 className="card-title">Thông tin tài khoản quản lý (MCC)</h3>
                        </div>
                    </div>
                    <div className="card-body">
                        {isMccInfoLoading ? (
                            <div className="loading-container" style={{ padding: 40 }}><div className="spinner"></div></div>
                        ) : mccInfo?.data ? (
                            <div className="gads-info-grid">
                                <div className="gads-info-item">
                                    <div className="gads-info-label">ID tài khoản</div>
                                    <div className="gads-info-value">{formatId(String(mccInfo.data.id))}</div>
                                </div>
                                <div className="gads-info-item">
                                    <div className="gads-info-label">Tên tài khoản</div>
                                    <div className="gads-info-value">{mccInfo.data.descriptiveName || '—'}</div>
                                </div>
                                <div className="gads-info-item">
                                    <div className="gads-info-label">Loại</div>
                                    <div className="gads-info-value">
                                        {mccInfo.data.manager ? (
                                            <span className="badge badge-info">Manager</span>
                                        ) : (
                                            <span className="badge badge-secondary">Client</span>
                                        )}
                                    </div>
                                </div>
                                <div className="gads-info-item">
                                    <div className="gads-info-label">Tiền tệ</div>
                                    <div className="gads-info-value">{mccInfo.data.currencyCode || '—'}</div>
                                </div>
                                <div className="gads-info-item">
                                    <div className="gads-info-label">Múi giờ</div>
                                    <div className="gads-info-value">{mccInfo.data.timeZone || '—'}</div>
                                </div>
                                <div className="gads-info-item">
                                    <div className="gads-info-label">Trạng thái</div>
                                    <div className="gads-info-value">{statusBadge(mccInfo.data.status || 'UNKNOWN')}</div>
                                </div>
                            </div>
                        ) : (
                            <div className="empty-state"><AlertCircle /><p>Không thể tải thông tin MCC</p></div>
                        )}
                    </div>
                </div>
            )}

            {/* Accessible Customers */}
            <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Globe size={20} className="text-primary" />
                        <h3 className="card-title">Tài khoản có quyền truy cập</h3>
                    </div>
                    <span className="badge badge-info">
                        {accessibleData?.data?.customers?.length || 0} tài khoản
                    </span>
                </div>
                <div className="card-body" style={{ padding: 0 }}>
                    {isAccessibleLoading ? (
                        <div className="loading-container" style={{ padding: 40 }}><div className="spinner"></div></div>
                    ) : (accessibleData?.data?.customers?.length ?? 0) > 0 ? (
                        <div className="table-container">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: 60 }}>#</th>
                                        <th>Customer ID</th>
                                        <th style={{ width: 120 }}>Hành động</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {accessibleData!.data.customers.map((cid: string, i: number) => (
                                        <tr key={cid}>
                                            <td>{i + 1}</td>
                                            <td style={{ fontFamily: 'monospace', fontWeight: 500 }}>
                                                {formatId(cid)}
                                            </td>
                                            <td>
                                                <button
                                                    className="btn btn-sm btn-outline-primary"
                                                    onClick={() => setViewState({
                                                        view: 'customer-detail',
                                                        customerId: cid,
                                                        customerName: formatId(cid),
                                                    })}
                                                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
                                                >
                                                    <Eye size={14} /> Xem
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="empty-state"><Database /><p>Không có tài khoản nào</p></div>
                    )}
                </div>
            </div>

            {/* Customer Clients under MCC */}
            {mccId && (
                <div className="card">
                    <div className="card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Users size={20} className="text-primary" />
                            <h3 className="card-title">Tài khoản con thuộc MCC</h3>
                        </div>
                        <span className="badge badge-info">
                            {clientsData?.data?.clients?.length || 0} tài khoản
                        </span>
                    </div>
                    <div className="card-body" style={{ padding: 0 }}>
                        {isClientsLoading ? (
                            <div className="loading-container" style={{ padding: 40 }}><div className="spinner"></div></div>
                        ) : (clientsData?.data?.clients?.length ?? 0) > 0 ? (
                            <div className="table-container">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: 60 }}>#</th>
                                            <th>Customer ID</th>
                                            <th>Tên</th>
                                            <th>Tiền tệ</th>
                                            <th>Múi giờ</th>
                                            <th>Loại</th>
                                            <th>Trạng thái</th>
                                            <th style={{ width: 100 }}>Hành động</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {clientsData!.data.clients.map((client: any, i: number) => (
                                            <tr key={client.id || i}>
                                                <td>{i + 1}</td>
                                                <td style={{ fontFamily: 'monospace', fontWeight: 500 }}>
                                                    {formatId(String(client.id))}
                                                </td>
                                                <td>{client.descriptiveName || '—'}</td>
                                                <td>{client.currencyCode || '—'}</td>
                                                <td>{client.timeZone || '—'}</td>
                                                <td>
                                                    {client.manager ? (
                                                        <span className="badge badge-info">Manager</span>
                                                    ) : (
                                                        <span className="badge badge-secondary">Client</span>
                                                    )}
                                                </td>
                                                <td>{statusBadge(client.status || 'UNKNOWN')}</td>
                                                <td>
                                                    <button
                                                        className="btn btn-sm btn-outline-primary"
                                                        onClick={() => setViewState({
                                                            view: 'customer-detail',
                                                            customerId: String(client.id),
                                                            customerName: client.descriptiveName || formatId(String(client.id)),
                                                        })}
                                                        style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
                                                    >
                                                        <Eye size={14} /> Xem
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="empty-state"><Database /><p>Không có tài khoản con nào</p></div>
                        )}
                    </div>
                </div>
            )}
        </>
    );

    // ===== Customer Detail View =====
    const renderCustomerDetail = () => (
        <>
            <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Shield size={20} className="text-primary" />
                        <h3 className="card-title">Thông tin tài khoản</h3>
                    </div>
                </div>
                <div className="card-body">
                    {isCustomerDetailLoading ? (
                        <div className="loading-container" style={{ padding: 40 }}><div className="spinner"></div></div>
                    ) : customerDetail?.data ? (
                        <div className="gads-info-grid">
                            <div className="gads-info-item">
                                <div className="gads-info-label">ID</div>
                                <div className="gads-info-value">{formatId(String(customerDetail.data.id))}</div>
                            </div>
                            <div className="gads-info-item">
                                <div className="gads-info-label">Tên</div>
                                <div className="gads-info-value">{customerDetail.data.descriptiveName || '—'}</div>
                            </div>
                            <div className="gads-info-item">
                                <div className="gads-info-label">Tiền tệ</div>
                                <div className="gads-info-value">{customerDetail.data.currencyCode || '—'}</div>
                            </div>
                            <div className="gads-info-item">
                                <div className="gads-info-label">Múi giờ</div>
                                <div className="gads-info-value">{customerDetail.data.timeZone || '—'}</div>
                            </div>
                            <div className="gads-info-item">
                                <div className="gads-info-label">Loại</div>
                                <div className="gads-info-value">
                                    {customerDetail.data.manager ? (
                                        <span className="badge badge-info">Manager</span>
                                    ) : (
                                        <span className="badge badge-secondary">Client</span>
                                    )}
                                </div>
                            </div>
                            <div className="gads-info-item">
                                <div className="gads-info-label">Trạng thái</div>
                                <div className="gads-info-value">{statusBadge(customerDetail.data.status || 'UNKNOWN')}</div>
                            </div>
                            <div className="gads-info-item">
                                <div className="gads-info-label">Auto Tagging</div>
                                <div className="gads-info-value">
                                    {customerDetail.data.autoTaggingEnabled ? (
                                        <span className="badge badge-success">Bật</span>
                                    ) : (
                                        <span className="badge badge-secondary">Tắt</span>
                                    )}
                                </div>
                            </div>
                            <div className="gads-info-item">
                                <div className="gads-info-label">Tài khoản Test</div>
                                <div className="gads-info-value">
                                    {customerDetail.data.testAccount ? (
                                        <span className="badge badge-warning">YES</span>
                                    ) : (
                                        <span className="badge badge-secondary">NO</span>
                                    )}
                                </div>
                            </div>
                            <div className="gads-info-item">
                                <div className="gads-info-label">Opt. Score Weight</div>
                                <div className="gads-info-value">
                                    {customerDetail.data.optimizationScoreWeight
                                        ? (Number(customerDetail.data.optimizationScoreWeight) * 100).toFixed(1) + '%'
                                        : '—'}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="empty-state"><AlertCircle /><p>Không thể tải thông tin tài khoản</p></div>
                    )}
                </div>
            </div>

            {/* Quick Actions */}
            <div className="gads-quick-actions">
                <button
                    className="gads-action-card"
                    onClick={() => setViewState({ ...viewState, view: 'campaigns' })}
                >
                    <Target size={24} />
                    <span>Chiến dịch</span>
                    <ChevronRight size={16} />
                </button>
                <button
                    className="gads-action-card"
                    onClick={() => setViewState({ ...viewState, view: 'spending' })}
                >
                    <DollarSign size={24} />
                    <span>Chi tiêu</span>
                    <ChevronRight size={16} />
                </button>
            </div>
        </>
    );

    // ===== Campaigns View =====
    const renderCampaigns = () => (
        <div className="card">
            <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Target size={20} className="text-primary" />
                    <h3 className="card-title">Danh sách chiến dịch</h3>
                </div>
                <span className="badge badge-info">
                    {campaignsData?.data?.campaigns?.length || 0} chiến dịch
                </span>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
                {isCampaignsLoading ? (
                    <div className="loading-container" style={{ padding: 40 }}><div className="spinner"></div></div>
                ) : (campaignsData?.data?.campaigns?.length ?? 0) > 0 ? (
                    <div className="table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ width: 60 }}>#</th>
                                    <th>Tên chiến dịch</th>
                                    <th>Trạng thái</th>
                                    <th>Kênh</th>
                                    <th>Chiến lược đặt giá</th>
                                    <th>Ngân sách</th>
                                    <th>Ngày bắt đầu</th>
                                    <th>Ngày kết thúc</th>
                                    <th style={{ width: 100 }}>Chi tiết</th>
                                </tr>
                            </thead>
                            <tbody>
                                {campaignsData!.data.campaigns.map((item: any, i: number) => (
                                    <tr key={item.campaign?.id || i}>
                                        <td>{i + 1}</td>
                                        <td style={{ fontWeight: 500 }}>{item.campaign?.name || '—'}</td>
                                        <td>{statusBadge(item.campaign?.status || 'UNKNOWN')}</td>
                                        <td>
                                            <span className="badge badge-secondary">
                                                {item.campaign?.advertisingChannelType || '—'}
                                            </span>
                                        </td>
                                        <td>{item.campaign?.biddingStrategyType || '—'}</td>
                                        <td>
                                            {item.campaignBudget?.amountMicros
                                                ? formatCurrency(item.campaignBudget.amountMicros)
                                                : '—'}
                                        </td>
                                        <td>{item.campaign?.startDate || '—'}</td>
                                        <td>{item.campaign?.endDate || '—'}</td>
                                        <td>
                                            <button
                                                className="btn btn-sm btn-outline-primary"
                                                onClick={() => setViewState({
                                                    ...viewState,
                                                    view: 'campaign-detail',
                                                    campaignId: String(item.campaign?.id),
                                                    campaignName: item.campaign?.name,
                                                })}
                                                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
                                            >
                                                <Eye size={14} /> Xem
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="empty-state"><Target /><p>Không có chiến dịch nào</p></div>
                )}
            </div>
        </div>
    );

    // ===== Campaign Detail View =====
    const renderCampaignDetail = () => {
        const data = campaignDetail?.data;
        return (
            <div className="card">
                <div className="card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Target size={20} className="text-primary" />
                        <h3 className="card-title">Chi tiết chiến dịch</h3>
                    </div>
                </div>
                <div className="card-body">
                    {isCampaignDetailLoading ? (
                        <div className="loading-container" style={{ padding: 40 }}><div className="spinner"></div></div>
                    ) : data ? (
                        <>
                            <div className="gads-info-grid" style={{ marginBottom: 24 }}>
                                <div className="gads-info-item">
                                    <div className="gads-info-label">Tên</div>
                                    <div className="gads-info-value">{data.campaign?.name || '—'}</div>
                                </div>
                                <div className="gads-info-item">
                                    <div className="gads-info-label">ID</div>
                                    <div className="gads-info-value">{data.campaign?.id || '—'}</div>
                                </div>
                                <div className="gads-info-item">
                                    <div className="gads-info-label">Trạng thái</div>
                                    <div className="gads-info-value">{statusBadge(data.campaign?.status || 'UNKNOWN')}</div>
                                </div>
                                <div className="gads-info-item">
                                    <div className="gads-info-label">Serving Status</div>
                                    <div className="gads-info-value">{data.campaign?.servingStatus || '—'}</div>
                                </div>
                                <div className="gads-info-item">
                                    <div className="gads-info-label">Kênh</div>
                                    <div className="gads-info-value">{data.campaign?.advertisingChannelType || '—'}</div>
                                </div>
                                <div className="gads-info-item">
                                    <div className="gads-info-label">Chiến lược</div>
                                    <div className="gads-info-value">{data.campaign?.biddingStrategyType || '—'}</div>
                                </div>
                                <div className="gads-info-item">
                                    <div className="gads-info-label">Ngày bắt đầu</div>
                                    <div className="gads-info-value">{data.campaign?.startDate || '—'}</div>
                                </div>
                                <div className="gads-info-item">
                                    <div className="gads-info-label">Ngày kết thúc</div>
                                    <div className="gads-info-value">{data.campaign?.endDate || '—'}</div>
                                </div>
                                <div className="gads-info-item">
                                    <div className="gads-info-label">Optimization Score</div>
                                    <div className="gads-info-value" style={{ fontWeight: 700, color: 'var(--primary)' }}>
                                        {data.campaign?.optimizationScore
                                            ? (Number(data.campaign.optimizationScore) * 100).toFixed(1) + '%'
                                            : '—'}
                                    </div>
                                </div>
                                <div className="gads-info-item">
                                    <div className="gads-info-label">Sub Type</div>
                                    <div className="gads-info-value">{data.campaign?.advertisingChannelSubType || '—'}</div>
                                </div>
                                <div className="gads-info-item">
                                    <div className="gads-info-label">Ad Serving Opt.</div>
                                    <div className="gads-info-value">{data.campaign?.adServingOptimizationStatus || '—'}</div>
                                </div>
                                <div className="gads-info-item">
                                    <div className="gads-info-label">Ngân sách</div>
                                    <div className="gads-info-value">
                                        {data.campaignBudget?.amountMicros
                                            ? formatCurrency(data.campaignBudget.amountMicros)
                                            : '—'}
                                    </div>
                                </div>
                            </div>

                            {/* Network Settings */}
                            <h4 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, marginTop: 20, color: 'var(--text-primary)' }}>
                                Mạng lưới hiển thị
                            </h4>
                            <div className="gads-info-grid" style={{ marginBottom: 24 }}>
                                <div className="gads-info-item">
                                    <div className="gads-info-label">Google Search</div>
                                    <div className="gads-info-value">
                                        {data.campaign?.networkSettings?.targetGoogleSearch ? 'Bật' : 'Tắt'}
                                    </div>
                                </div>
                                <div className="gads-info-item">
                                    <div className="gads-info-label">Search Network</div>
                                    <div className="gads-info-value">
                                        {data.campaign?.networkSettings?.targetSearchNetwork ? 'Bật' : 'Tắt'}
                                    </div>
                                </div>
                                <div className="gads-info-item">
                                    <div className="gads-info-label">Content Network</div>
                                    <div className="gads-info-value">
                                        {data.campaign?.networkSettings?.targetContentNetwork ? 'Bật' : 'Tắt'}
                                    </div>
                                </div>
                                <div className="gads-info-item">
                                    <div className="gads-info-label">Partner Search</div>
                                    <div className="gads-info-value">
                                        {data.campaign?.networkSettings?.targetPartnerSearchNetwork ? 'Bật' : 'Tắt'}
                                    </div>
                                </div>
                            </div>

                            {/* Metrics */}
                            {data.metrics && (
                                <>
                                    <h4 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>
                                        Hiệu suất
                                    </h4>
                                    <div className="gads-metrics-grid">
                                        <div className="gads-metric-card">
                                            <div className="gads-metric-value">{Number(data.metrics.impressions || 0).toLocaleString()}</div>
                                            <div className="gads-metric-label">Lượt hiển thị</div>
                                        </div>
                                        <div className="gads-metric-card">
                                            <div className="gads-metric-value">{Number(data.metrics.clicks || 0).toLocaleString()}</div>
                                            <div className="gads-metric-label">Lượt click</div>
                                        </div>
                                        <div className="gads-metric-card">
                                            <div className="gads-metric-value">{formatCurrency(data.metrics.costMicros || 0)}</div>
                                            <div className="gads-metric-label">Chi phí</div>
                                        </div>
                                        <div className="gads-metric-card">
                                            <div className="gads-metric-value">{Number(data.metrics.conversions || 0).toLocaleString()}</div>
                                            <div className="gads-metric-label">Chuyển đổi</div>
                                        </div>
                                        <div className="gads-metric-card">
                                            <div className="gads-metric-value">{(Number(data.metrics.ctr || 0) * 100).toFixed(2)}%</div>
                                            <div className="gads-metric-label">CTR</div>
                                        </div>
                                        <div className="gads-metric-card">
                                            <div className="gads-metric-value">{formatCurrency(data.metrics.averageCpc || 0)}</div>
                                            <div className="gads-metric-label">CPC trung bình</div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </>
                    ) : (
                        <div className="empty-state"><AlertCircle /><p>Không thể tải chi tiết chiến dịch</p></div>
                    )}
                </div>
            </div>
        );
    };

    // ===== Spending View =====
    const renderSpending = () => (
        <div className="card">
            <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <DollarSign size={20} className="text-primary" />
                    <h3 className="card-title">Chi tiêu tài khoản</h3>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Clock size={16} className="text-muted" />
                    <select
                        className="form-select"
                        style={{ width: 'auto', padding: '4px 8px', fontSize: 13 }}
                        value={selectedDateRange}
                        onChange={(e) => setSelectedDateRange(e.target.value)}
                    >
                        <option value="LAST_7_DAYS">7 ngày qua</option>
                        <option value="LAST_14_DAYS">14 ngày qua</option>
                        <option value="LAST_30_DAYS">30 ngày qua</option>
                        <option value="THIS_MONTH">Tháng này</option>
                        <option value="LAST_MONTH">Tháng trước</option>
                    </select>
                </div>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
                {isSpendingLoading ? (
                    <div className="loading-container" style={{ padding: 40 }}><div className="spinner"></div></div>
                ) : (spendingData?.data?.spending?.length ?? 0) > 0 ? (
                    <>
                        {/* Summary */}
                        <div className="gads-spending-summary">
                            <div className="gads-metric-card" style={{ background: 'var(--primary-light)' }}>
                                <div className="gads-metric-value" style={{ color: 'var(--primary)' }}>
                                    {formatCurrency(
                                        spendingData!.data.spending.reduce(
                                            (sum: number, s: any) => sum + Number(s.metrics?.costMicros || 0), 0
                                        )
                                    )}
                                </div>
                                <div className="gads-metric-label">Tổng chi phí</div>
                            </div>
                            <div className="gads-metric-card">
                                <div className="gads-metric-value">
                                    {spendingData!.data.spending.reduce(
                                        (sum: number, s: any) => sum + Number(s.metrics?.clicks || 0), 0
                                    ).toLocaleString()}
                                </div>
                                <div className="gads-metric-label">Tổng clicks</div>
                            </div>
                            <div className="gads-metric-card">
                                <div className="gads-metric-value">
                                    {spendingData!.data.spending.reduce(
                                        (sum: number, s: any) => sum + Number(s.metrics?.impressions || 0), 0
                                    ).toLocaleString()}
                                </div>
                                <div className="gads-metric-label">Tổng hiển thị</div>
                            </div>
                        </div>

                        <div className="table-container">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Ngày</th>
                                        <th>Chi phí</th>
                                        <th>Hiển thị</th>
                                        <th>Clicks</th>
                                        <th>CTR</th>
                                        <th>CPC TB</th>
                                        <th>Chuyển đổi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {spendingData!.data.spending.map((item: any, i: number) => (
                                        <tr key={i}>
                                            <td style={{ fontWeight: 500 }}>{item.segments?.date || '—'}</td>
                                            <td style={{ fontWeight: 600, color: '#059669' }}>
                                                {formatCurrency(item.metrics?.costMicros || 0)}
                                            </td>
                                            <td>{Number(item.metrics?.impressions || 0).toLocaleString()}</td>
                                            <td>{Number(item.metrics?.clicks || 0).toLocaleString()}</td>
                                            <td>{(Number(item.metrics?.ctr || 0) * 100).toFixed(2)}%</td>
                                            <td>{formatCurrency(item.metrics?.averageCpc || 0)}</td>
                                            <td>{Number(item.metrics?.conversions || 0).toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                ) : (
                    <div className="empty-state"><DollarSign /><p>Không có dữ liệu chi tiêu trong khoảng thời gian này</p></div>
                )}
            </div>
        </div>
    );

    // ===== Main Render =====
    const renderContent = () => {
        if (!isConnected) {
            return (
                <div className="empty-state" style={{ marginTop: 40 }}>
                    <Plug size={48} />
                    <h3>Chưa kết nối Google Ads</h3>
                    <p>Vui lòng kết nối tài khoản Google để truy cập dữ liệu Google Ads API</p>
                </div>
            );
        }

        switch (viewState.view) {
            case 'overview':
                return renderOverview();
            case 'customer-detail':
                return renderCustomerDetail();
            case 'campaigns':
                return renderCampaigns();
            case 'campaign-detail':
                return renderCampaignDetail();
            case 'spending':
                return renderSpending();
            default:
                return renderOverview();
        }
    };

    if (isStatusLoading) {
        return (
            <div className="loading-container full-screen">
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {viewState.view !== 'overview' && (
                            <button
                                className="btn btn-sm btn-ghost"
                                onClick={() => {
                                    if (viewState.view === 'campaign-detail') {
                                        setViewState({
                                            view: 'campaigns',
                                            customerId: viewState.customerId,
                                            customerName: viewState.customerName,
                                        });
                                    } else if (viewState.view === 'campaigns' || viewState.view === 'spending') {
                                        setViewState({
                                            view: 'customer-detail',
                                            customerId: viewState.customerId,
                                            customerName: viewState.customerName,
                                        });
                                    } else {
                                        setViewState({ view: 'overview' });
                                    }
                                }}
                                style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid var(--border)' }}
                            >
                                <ArrowLeft size={18} />
                            </button>
                        )}
                        Google Ads Explorer
                    </h1>
                    {viewState.view !== 'overview' && renderBreadcrumb()}
                    {viewState.view === 'overview' && (
                        <p className="page-subtitle">Khám phá dữ liệu Google Ads API trực tiếp</p>
                    )}
                </div>
                {isConnected && viewState.view === 'overview' && (
                    <button
                        className="btn btn-outline-primary"
                        onClick={() => {
                            queryClient.invalidateQueries({ queryKey: ['googleAds'] });
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                        <RefreshCw size={16} /> Làm mới
                    </button>
                )}
            </div>

            {renderConnectionCard()}

            <div style={{ marginTop: 20 }}>
                {renderContent()}
            </div>
        </div>
    );
}
