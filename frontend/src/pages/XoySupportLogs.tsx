import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ClipboardCopy, Search, ShieldAlert, X } from 'lucide-react';
import { xoySupportLogsApi } from '../api/client';

type Filters = { supportId: string; traceId: string; jobType: string; sentFrom: string; sentTo: string };
const EMPTY_FILTERS: Filters = { supportId: '', traceId: '', jobType: '', sentFrom: '', sentTo: '' };

function formatTime(value: string) {
    return new Date(value).toLocaleString('vi-VN');
}

function copyableText(license: any, runs: any[]) {
    const header = [`License: ${license.name}`, license.telegramId ? `Telegram: ${license.telegramId}` : '', `Gói: ${license.plan}`].filter(Boolean).join(' · ');
    return [header, ...runs.flatMap((run) => [
        '', `=== ${run.supportId} · Run ${run.runId} · ${formatTime(run.updatedAt)} ===`,
        ...run.events.map((event: any) => `[${formatTime(event.occurredAt)}]${event.jobType ? ` [${event.jobType}]` : ''}${event.traceId ? ` ${event.traceId}` : ''}${event.success === true ? ' ✓' : event.success === false ? ' ✗' : ''}\n${event.text}`),
    ])].join('\n');
}

export default function XoySupportLogs() {
    const [form, setForm] = useState<Filters>(EMPTY_FILTERS);
    const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
    const [selectedLicense, setSelectedLicense] = useState<any>(null);
    const [copied, setCopied] = useState(false);
    const list = useQuery({ queryKey: ['xoy-support-logs', filters], queryFn: () => xoySupportLogsApi.list(filters) });
    const detail = useQuery({
        queryKey: ['xoy-license-support-logs', selectedLicense?.id, filters],
        queryFn: () => xoySupportLogsApi.listByLicense(selectedLicense.id, filters),
        enabled: Boolean(selectedLicense?.id),
    });
    const groups = list.data?.data?.data || [];
    const runs = detail.data?.data || [];
    const knownTypes = useMemo<string[]>(() => [...new Set<string>(groups.flatMap((group: any) => (group.jobTypes || []) as string[]))].sort(), [groups]);
    const updateForm = (key: keyof Filters, value: string) => setForm((current) => ({ ...current, [key]: value }));

    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        setSelectedLicense(null);
        setCopied(false);
        setFilters({ ...form, supportId: form.supportId.trim(), traceId: form.traceId.trim(), jobType: form.jobType.trim() });
    };
    const copyAll = async () => {
        if (!selectedLicense || !runs.length) return;
        await navigator.clipboard.writeText(copyableText(selectedLicense, runs));
        setCopied(true);
    };

    return <div>
        <div className="page-header"><div><h1 className="page-title">XOY Support Logs</h1><p className="page-subtitle">Nhật ký được gom theo license/khách hàng; Chrome profile chỉ là nguồn gửi log.</p></div></div>
        <div className="card" style={{ marginBottom: 16 }}><form onSubmit={submit} style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', padding: 16 }}>
            <input value={form.supportId} onChange={(event) => updateForm('supportId', event.target.value)} placeholder="Support ID" />
            <input value={form.traceId} onChange={(event) => updateForm('traceId', event.target.value)} placeholder="Trace ID" />
            <input value={form.jobType} onChange={(event) => updateForm('jobType', event.target.value)} list="xoy-log-types" placeholder="Loại log / job type" />
            <datalist id="xoy-log-types">{knownTypes.map((type) => <option key={type} value={type} />)}</datalist>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Từ ngày<input type="date" value={form.sentFrom} onChange={(event) => updateForm('sentFrom', event.target.value)} /></label>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Đến ngày<input type="date" value={form.sentTo} onChange={(event) => updateForm('sentTo', event.target.value)} /></label>
            <button className="btn btn-primary"><Search size={16} />Lọc log</button>
        </form></div>
        <div className="card"><div className="table-container"><table className="data-table"><thead><tr><th>Khách hàng / License</th><th>Gói</th><th>Loại log</th><th>Runs / sự kiện</th><th>Gửi gần nhất</th><th></th></tr></thead><tbody>
            {list.isLoading ? <tr><td colSpan={6} style={{ textAlign: 'center', padding: 28 }}>Đang tải...</td></tr> : groups.length === 0 ? <tr><td colSpan={6} style={{ textAlign: 'center', padding: 28 }}>Chưa có support log phù hợp.</td></tr> : groups.map((group: any) => <tr key={group.license.id}>
                <td><strong>{group.license.name}</strong>{group.license.telegramId && <small style={{ display: 'block' }}>Telegram: {group.license.telegramId}</small>}</td>
                <td>{group.license.plan === 'BASIC' ? 'Cơ bản' : 'Full'}</td>
                <td><small>{group.jobTypes.length ? group.jobTypes.join(', ') : 'Chưa phân loại'}</small></td>
                <td>{group.runs} runs / {group.events} sự kiện</td><td>{formatTime(group.lastSentAt)}</td>
                <td><button className="btn btn-secondary" onClick={() => { setSelectedLicense(group.license); setCopied(false); }}>Mở log</button></td>
            </tr>)}
        </tbody></table></div></div>
        {list.data?.data?.capped && <small style={{ display: 'block', marginTop: 8, color: 'var(--text-secondary)' }}>Đang hiển thị tối đa 500 runs gần nhất. Hãy dùng filter để thu hẹp dữ liệu.</small>}
        {selectedLicense && <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,.72)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 50, padding: 20 }} onClick={() => setSelectedLicense(null)}>
            <div className="card" style={{ width: 'min(1100px, 100%)', maxHeight: '90vh', overflow: 'auto' }} onClick={(event) => event.stopPropagation()}>
                <div className="card-header" style={{ justifyContent: 'space-between' }}><span><ShieldAlert size={18} />{selectedLicense.name}{selectedLicense.telegramId ? ` · ${selectedLicense.telegramId}` : ''}</span><div style={{ display: 'flex', gap: 8 }}><button className="btn btn-secondary" disabled={!runs.length} onClick={copyAll}>{copied ? <Check size={16} /> : <ClipboardCopy size={16} />}{copied ? 'Đã sao chép' : 'Copy toàn bộ log'}</button><button className="btn btn-secondary" onClick={() => setSelectedLicense(null)} aria-label="Đóng"><X size={16} /></button></div></div>
                {detail.isLoading ? <div style={{ padding: 20 }}>Đang tải log...</div> : detail.isError ? <div style={{ padding: 20, color: 'var(--danger)' }}>Không tải được support log.</div> : runs.length === 0 ? <div style={{ padding: 20 }}>Không có log phù hợp với filter hiện tại.</div> : <div style={{ padding: 16, display: 'grid', gap: 14 }}>{runs.map((run: any) => <section key={run.id} style={{ border: '1px solid #334155', borderRadius: 8, overflow: 'hidden', background: '#0f172a' }}>
                    <div style={{ padding: '10px 12px', color: '#e2e8f0', background: '#1e293b', fontSize: 13 }}><strong>{run.supportId}</strong> · {run.events.length} sự kiện · {formatTime(run.updatedAt)}</div>
                    <div style={{ display: 'grid', gap: 7, padding: 10 }}>{run.events.map((event: any) => <div key={event.id} style={{ borderLeft: `4px solid ${event.success === false ? '#f87171' : event.success === true ? '#34d399' : '#64748b'}`, background: '#111827', color: '#e5e7eb', padding: '9px 12px', borderRadius: 4 }}>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 5 }}>{formatTime(event.occurredAt)} {event.traceId ? `· ${event.traceId}` : ''} {event.jobType ? `· ${event.jobType}` : ''}</div>
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, color: '#f8fafc' }}>{event.text}</pre>
                    </div>)}</div>
                </section>)}</div>}
            </div>
        </div>}
    </div>;
}
