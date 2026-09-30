import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Filter, RotateCcw, Search, ShieldAlert } from 'lucide-react';
import { xoySupportLogsApi } from '../api/client';

export type XoyLogFilters = { supportId: string; traceId: string; jobType: string; sentFrom: string; sentTo: string };
export const EMPTY_XOY_LOG_FILTERS: XoyLogFilters = { supportId: '', traceId: '', jobType: '', sentFrom: '', sentTo: '' };

export function formatXoyLogTime(value?: string) { return value ? new Date(value).toLocaleString('vi-VN') : '—'; }

export function XoySupportLogFilters({ value, jobTypes, onApply }: { value: XoyLogFilters; jobTypes: string[]; onApply: (filters: XoyLogFilters) => void }) {
    const [form, setForm] = useState<XoyLogFilters>(value);
    const update = (key: keyof XoyLogFilters, next: string) => setForm((current) => ({ ...current, [key]: next }));
    const submit = (event: React.FormEvent) => { event.preventDefault(); onApply({ ...form, supportId: form.supportId.trim(), traceId: form.traceId.trim(), jobType: form.jobType.trim() }); };
    const reset = () => { setForm(EMPTY_XOY_LOG_FILTERS); onApply(EMPTY_XOY_LOG_FILTERS); };
    return <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><Filter size={18} />Tìm kiếm & lọc</div>
        <form onSubmit={submit} style={{ padding: 16 }}>
            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
                <div><label className="form-label">Support ID</label><input className="form-input" value={form.supportId} onChange={(event) => update('supportId', event.target.value)} placeholder="SUP-..." /></div>
                <div><label className="form-label">Trace ID</label><input className="form-input" value={form.traceId} onChange={(event) => update('traceId', event.target.value)} placeholder="Ví dụ #XM-ORA7" /></div>
                <div><label className="form-label">Loại log / job</label><select className="form-select" value={form.jobType} onChange={(event) => update('jobType', event.target.value)}><option value="">Tất cả loại log</option>{jobTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></div>
                <div><label className="form-label">Gửi từ ngày</label><input className="form-input" type="date" value={form.sentFrom} onChange={(event) => update('sentFrom', event.target.value)} /></div>
                <div><label className="form-label">Gửi đến ngày</label><input className="form-input" type="date" value={form.sentTo} onChange={(event) => update('sentTo', event.target.value)} /></div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}><button className="btn btn-primary"><Search size={16} />Tìm log</button><button type="button" className="btn btn-secondary" onClick={reset}><RotateCcw size={16} />Đặt lại</button></div>
        </form>
    </div>;
}

export default function XoySupportLogs() {
    const navigate = useNavigate();
    const [filters, setFilters] = useState<XoyLogFilters>(EMPTY_XOY_LOG_FILTERS);
    const list = useQuery({ queryKey: ['xoy-support-logs', filters], queryFn: () => xoySupportLogsApi.list(filters) });
    const groups = list.data?.data?.data || [];
    const knownTypes = useMemo<string[]>(() => [...new Set<string>(groups.flatMap((group: any) => group.jobTypes || []))].sort(), [groups]);
    return <div>
        <div className="page-header"><div><h1 className="page-title">Nhật ký hỗ trợ XOY</h1><p className="page-subtitle">Nhật ký được gom theo License/khách hàng. Mở chi tiết để tra cứu và sao chép từng mã hỗ trợ.</p></div></div>
        <XoySupportLogFilters value={filters} jobTypes={knownTypes} onApply={setFilters} />
        <div className="card"><div className="card-header"><ShieldAlert size={18} />Danh sách hỗ trợ theo khách hàng</div><div className="table-container"><table className="data-table"><thead><tr><th>Khách hàng / License</th><th>Gói</th><th>Loại log</th><th>Lượt chạy / sự kiện</th><th>Gửi gần nhất</th><th></th></tr></thead><tbody>
            {list.isLoading ? <tr><td colSpan={6} style={{ textAlign: 'center', padding: 28 }}>Đang tải...</td></tr> : groups.length === 0 ? <tr><td colSpan={6} style={{ textAlign: 'center', padding: 28 }}>Chưa có support log phù hợp.</td></tr> : groups.map((group: any) => <tr key={group.license.id}>
                <td><strong>{group.license.name}</strong>{group.license.telegramId && <small style={{ display: 'block' }}>Telegram: {group.license.telegramId}</small>}</td><td>{group.license.plan === 'BASIC' ? 'Cơ bản' : 'Đầy đủ'}</td><td><small>{group.jobTypes?.length ? group.jobTypes.join(', ') : 'Chưa phân loại'}</small></td><td>{group.runs} lượt chạy / {group.events} sự kiện</td><td>{formatXoyLogTime(group.lastSentAt)}</td>
                <td><button className="btn btn-secondary" onClick={() => navigate(`/xoy-support-logs/${group.license.id}`)}>Chi tiết</button></td>
            </tr>)}
        </tbody></table></div></div>
        {list.data?.data?.capped && <small style={{ display: 'block', marginTop: 8, color: 'var(--text-secondary)' }}>Đang hiển thị tối đa 500 runs gần nhất. Hãy dùng bộ lọc để thu hẹp dữ liệu.</small>}
    </div>;
}
