import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, ShieldAlert, X } from 'lucide-react';
import { xoySupportLogsApi } from '../api/client';

function formatTime(value: string) {
    return new Date(value).toLocaleString('vi-VN');
}

export default function XoySupportLogs() {
    const [supportId, setSupportId] = useState('');
    const [traceId, setTraceId] = useState('');
    const [filters, setFilters] = useState({ supportId: '', traceId: '' });
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const list = useQuery({ queryKey: ['xoy-support-logs', filters], queryFn: () => xoySupportLogsApi.list(filters) });
    const detail = useQuery({ queryKey: ['xoy-support-log', selectedId], queryFn: () => xoySupportLogsApi.get(selectedId!), enabled: !!selectedId });
    const runs = list.data?.data?.data || [];
    const selected = detail.data?.data;

    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        setFilters({ supportId: supportId.trim(), traceId: traceId.trim() });
    };

    return <div>
        <div className="page-header"><div><h1 className="page-title">XOY Support Logs</h1><p className="page-subtitle">Tra cứu nhật ký server theo Support ID hoặc Trace ID của extension.</p></div></div>
        <div className="card" style={{ marginBottom: 16 }}><form onSubmit={submit} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: 16 }}>
            <input value={supportId} onChange={(event) => setSupportId(event.target.value)} placeholder="Support ID, ví dụ SUP-20260929-AB12" style={{ minWidth: 260 }} />
            <input value={traceId} onChange={(event) => setTraceId(event.target.value)} placeholder="Trace ID, ví dụ #BC-AB12" style={{ minWidth: 210 }} />
            <button className="btn btn-primary"><Search size={16} />Tra cứu</button>
        </form></div>
        <div className="card"><div className="table-container"><table className="data-table"><thead><tr><th>Support ID</th><th>License / thiết bị</th><th>Sự kiện</th><th>Cập nhật</th><th></th></tr></thead><tbody>
            {list.isLoading ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: 28 }}>Đang tải...</td></tr> : runs.length === 0 ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: 28 }}>Chưa có support log phù hợp.</td></tr> : runs.map((run: any) => <tr key={run.id}>
                <td><code>{run.supportId}</code></td><td><div>{run.device?.license?.name || '-'}</div><small>{run.device?.displayName || '-'}</small></td><td>{run._count?.events || 0}</td><td>{formatTime(run.updatedAt)}</td><td><button className="btn btn-secondary" onClick={() => setSelectedId(run.supportId)}>Mở</button></td>
            </tr>)}
        </tbody></table></div></div>
        {selectedId && <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 50, padding: 20 }} onClick={() => setSelectedId(null)}>
            <div className="card" style={{ width: 'min(1000px, 100%)', maxHeight: '90vh', overflow: 'auto' }} onClick={(event) => event.stopPropagation()}>
                <div className="card-header" style={{ justifyContent: 'space-between' }}><span><ShieldAlert size={18} />{selectedId}</span><button className="btn btn-secondary" onClick={() => setSelectedId(null)} aria-label="Đóng"><X size={16} /></button></div>
                {detail.isLoading ? <div style={{ padding: 20 }}>Đang tải log...</div> : detail.isError ? <div style={{ padding: 20, color: 'var(--danger)' }}>Không tải được support log.</div> : selected && <>
                    <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>License: {selected.device?.license?.name} · Thiết bị: {selected.device?.displayName} · Run: <code>{selected.runId}</code></div>
                    <div style={{ padding: '0 16px 16px', display: 'grid', gap: 8 }}>{selected.events.map((event: any) => <div key={event.id} style={{ borderLeft: `4px solid ${event.success === false ? '#dc2626' : '#16a34a'}`, background: '#f8fafc', padding: '9px 12px', borderRadius: 4 }}>
                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{formatTime(event.occurredAt)} {event.traceId ? `· ${event.traceId}` : ''} {event.jobType ? `· ${event.jobType}` : ''}</div><pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13 }}>{event.text}</pre>
                    </div>)}</div>
                </>}
            </div>
        </div>}
    </div>;
}
