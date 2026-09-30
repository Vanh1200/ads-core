import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, CheckCircle2, PauseCircle, RefreshCw, XCircle } from 'lucide-react';
import { xoyOperationsApi } from '../api/client';

function dateOffset(days: number) { return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10); }
function number(value: unknown) { return new Intl.NumberFormat('vi-VN').format(Number(value) || 0); }
function statusLabel(status: string) {
    return ({ COMPLETED: 'Hoàn tất', FAILED: 'Thất bại', STOPPED: 'Đã dừng', INTERRUPTED: 'Gián đoạn', RUNNING: 'Đang chạy' } as Record<string, string>)[status] || status || 'Đang chạy';
}
function jobTypeLabel(type: string) {
    return ({ backup_campaign: 'Sao lưu chiến dịch', backup_perf: 'Báo cáo hiệu suất', verify: 'Xác minh', rename: 'Đổi tên', appeal: 'Kháng nghị', reactivate: 'Kích hoạt lại' } as Record<string, string>)[type] || type;
}

export default function XoyOperations() {
    const navigate = useNavigate();
    const [range, setRange] = useState({ sentFrom: dateOffset(-30), sentTo: dateOffset(0) });
    const metrics = useQuery({ queryKey: ['xoy-operations', range], queryFn: () => xoyOperationsApi.get(range) });
    const data = metrics.data?.data;
    const overview = data?.overview || {};
    const cards = [
        { label: 'Tổng job', value: overview.jobs, icon: Activity, color: 'var(--primary)' },
        { label: 'Hoàn tất', value: overview.completed, icon: CheckCircle2, color: 'var(--secondary)' },
        { label: 'Thất bại', value: overview.failed, icon: XCircle, color: 'var(--danger)' },
        { label: 'Đang chạy', value: overview.active, icon: RefreshCw, color: 'var(--warning)' },
        { label: 'RPC lỗi', value: overview.rpcErrors, icon: AlertTriangle, color: 'var(--danger)' },
        { label: 'Đã dừng', value: overview.stopped, icon: PauseCircle, color: 'var(--text-secondary)' },
    ];
    return <div>
        <div className="page-header"><div><h1 className="page-title">Vận hành XOY</h1><p className="page-subtitle">Theo dõi trạng thái job, tiến độ xử lý và lỗi RPC từ extension.</p></div></div>
        <div className="card" style={{ marginBottom: 16 }}><form style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }} onSubmit={(event) => { event.preventDefault(); metrics.refetch(); }}>
            <div><label className="form-label">Từ ngày</label><input className="form-input" type="date" value={range.sentFrom} onChange={(event) => setRange({ ...range, sentFrom: event.target.value })} /></div>
            <div><label className="form-label">Đến ngày</label><input className="form-input" type="date" value={range.sentTo} onChange={(event) => setRange({ ...range, sentTo: event.target.value })} /></div>
            <button className="btn btn-primary" type="submit"><RefreshCw size={16} />Làm mới</button>
        </form></div>
        {metrics.isLoading ? <div className="card">Đang tải số liệu vận hành...</div> : metrics.isError ? <div className="card" style={{ color: 'var(--danger)' }}>Không tải được số liệu vận hành XOY.</div> : <>
            <div className="stats-grid">{cards.map(({ label, value, icon: Icon, color }) => <div className="stat-card" key={label}><div className="stat-icon" style={{ background: color }}><Icon size={21} /></div><div><div className="stat-label">{label}</div><div className="stat-value">{number(value)}</div></div></div>)}</div>
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginTop: 16 }}>
                <div className="stat-card"><div><div className="stat-label">Mục tiêu đầu vào</div><div className="stat-value">{number(overview.targets)}</div></div></div>
                <div className="stat-card"><div><div className="stat-label">Đã xử lý</div><div className="stat-value">{number(overview.processed)}</div></div></div>
                <div className="stat-card"><div><div className="stat-label">Tài khoản thành công</div><div className="stat-value">{number(overview.successes)}</div></div></div>
                <div className="stat-card"><div><div className="stat-label">Tài khoản thất bại</div><div className="stat-value">{number(overview.failures)}</div></div></div>
                <div className="stat-card"><div><div className="stat-label">Đã bỏ qua</div><div className="stat-value">{number(overview.skipped)}</div></div></div>
            </div>
            <div className="card" style={{ marginTop: 16 }}><div className="card-header">Hiệu quả theo tính năng</div><div className="table-container"><table className="data-table"><thead><tr><th>Tính năng</th><th>Job</th><th>Hoàn tất</th><th>Thất bại</th><th>Đang chạy</th><th>Mục tiêu</th><th>Thành công</th><th>Thất bại</th><th>Bỏ qua</th></tr></thead><tbody>{(data?.byJobType || []).map((row: any) => <tr key={row.jobType}><td>{jobTypeLabel(row.jobType)}</td><td>{number(row.jobs)}</td><td>{number(row.completed)}</td><td>{number(row.failed)}</td><td>{number(row.active)}</td><td>{number(row.targets)}</td><td>{number(row.successes)}</td><td>{number(row.failures)}</td><td>{number(row.skipped)}</td></tr>)}</tbody></table></div></div>
            <div className="card" style={{ marginTop: 16 }}><div className="card-header">50 job gần nhất</div><div className="table-container"><table className="data-table"><thead><tr><th>Thời gian</th><th>Khách hàng</th><th>Tính năng</th><th>Trạng thái</th><th>Tiến độ</th><th>Kết quả</th><th>Mã hỗ trợ</th><th></th></tr></thead><tbody>{(data?.recentJobs || []).map((job: any) => {
                const detailUrl = `/xoy-support-logs/${encodeURIComponent(job.license?.id || '')}?supportId=${encodeURIComponent(job.supportId || '')}`;
                return <tr key={job.id} onClick={() => navigate(detailUrl)} style={{ cursor: 'pointer' }} title="Mở chi tiết job">
                    <td>{new Date(job.updatedAt).toLocaleString('vi-VN')}</td><td>{job.license?.name || '—'}</td><td>{jobTypeLabel(job.jobType)}</td><td>{statusLabel(job.jobStatus)}</td><td>{number(job.processedTargets)}/{number(job.targetTotal)}</td><td>{number(job.successfulTargets)} thành công · {number(job.failedTargets)} lỗi · {number(job.skippedTargets)} bỏ qua</td><td>{job.supportId}</td><td><button className="btn btn-secondary btn-sm" onClick={(event) => { event.stopPropagation(); navigate(detailUrl); }}>Chi tiết</button></td>
                </tr>;
            })}</tbody></table></div>{data?.capped && <small style={{ display: 'block', padding: 12 }}>Dữ liệu đã chạm giới hạn 5.000 job; hãy thu hẹp khoảng thời gian.</small>}</div>
        </>}
    </div>;
}
