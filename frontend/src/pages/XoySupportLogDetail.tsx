import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, ClipboardCopy, ShieldAlert } from 'lucide-react';
import { xoyLicensesApi, xoySupportLogsApi } from '../api/client';
import { EMPTY_XOY_LOG_FILTERS, formatXoyLogTime, type XoyLogFilters, XoySupportLogFilters } from './XoySupportLogs';

function copyableRun(run: any) {
    return [`=== ${run.supportId} · Run ${run.runId} · ${formatXoyLogTime(run.updatedAt)} ===`, ...run.events.map((event: any) => `[${formatXoyLogTime(event.occurredAt)}]${event.jobType ? ` [${event.jobType}]` : ''}${event.traceId ? ` ${event.traceId}` : ''}${event.success === true ? ' ✓' : event.success === false ? ' ✗' : ''}\n${event.text}`)].join('\n');
}
function copyableAll(license: any, runs: any[]) {
    const header = [`License: ${license?.name || '—'}`, license?.telegramId ? `Telegram: ${license.telegramId}` : '', license?.plan ? `Gói: ${license.plan}` : ''].filter(Boolean).join(' · ');
    return [header, ...runs.flatMap((run) => ['', copyableRun(run)])].join('\n');
}

export default function XoySupportLogDetail() {
    const { licenseId } = useParams<{ licenseId: string }>();
    const navigate = useNavigate();
    const [filters, setFilters] = useState<XoyLogFilters>(EMPTY_XOY_LOG_FILTERS);
    const [copied, setCopied] = useState<string | null>(null);
    const licenses = useQuery({ queryKey: ['xoy-licenses'], queryFn: xoyLicensesApi.list });
    const logs = useQuery({ queryKey: ['xoy-license-support-logs', licenseId, filters], queryFn: () => xoySupportLogsApi.listByLicense(licenseId!, filters), enabled: Boolean(licenseId) });
    const license = (licenses.data?.data || []).find((item: any) => item.id === licenseId);
    const runs = logs.data?.data || [];
    const knownTypes = useMemo<string[]>(() => [...new Set<string>(runs.flatMap((run: any) => run.events.map((event: any) => event.jobType).filter(Boolean)))].sort(), [runs]);
    const copy = async (key: string, text: string) => { await navigator.clipboard.writeText(text); setCopied(key); };
    return <div>
        <div className="page-header" style={{ alignItems: 'center' }}><div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><button className="btn btn-secondary" onClick={() => navigate('/xoy-support-logs')}><ArrowLeft size={16} />Quay lại</button><div><h1 className="page-title">Support log · {license?.name || 'Đang tải...'}</h1><p className="page-subtitle">{license?.telegramId ? `Telegram: ${license.telegramId} · ` : ''}Tra cứu, lọc và sao chép dữ liệu theo từng support ID.</p></div></div><button className="btn btn-primary" disabled={!runs.length} onClick={() => copy('all', copyableAll(license, runs))}>{copied === 'all' ? <Check size={16} /> : <ClipboardCopy size={16} />}{copied === 'all' ? 'Đã sao chép' : 'Copy toàn bộ log'}</button></div>
        <XoySupportLogFilters value={filters} jobTypes={knownTypes} onApply={setFilters} />
        <div className="card"><div className="card-header"><ShieldAlert size={18} />Chi tiết support logs</div>
            {logs.isLoading ? <div style={{ padding: 20 }}>Đang tải log...</div> : logs.isError ? <div style={{ padding: 20, color: 'var(--danger)' }}>Không tải được support log.</div> : runs.length === 0 ? <div style={{ padding: 20 }}>Không có log phù hợp với bộ lọc hiện tại.</div> : <div style={{ padding: 16, display: 'grid', gap: 14 }}>{runs.map((run: any) => <section key={run.id} className="card" style={{ margin: 0, overflow: 'hidden' }}>
                <div className="card-header" style={{ justifyContent: 'space-between' }}><span><strong>{run.supportId}</strong> · {run.events.length} sự kiện · {formatXoyLogTime(run.updatedAt)}</span><button className="btn btn-secondary btn-sm" onClick={() => copy(run.id, copyableRun(run))}>{copied === run.id ? <Check size={15} /> : <ClipboardCopy size={15} />}{copied === run.id ? 'Đã sao chép' : 'Copy support'}</button></div>
                <div style={{ display: 'grid', gap: 8, padding: 12 }}>{run.events.map((event: any) => <div key={event.id} style={{ borderLeft: `4px solid ${event.success === false ? 'var(--danger)' : event.success === true ? 'var(--secondary)' : 'var(--border)'}`, background: 'var(--background)', padding: '10px 12px', borderRadius: 4 }}><div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{formatXoyLogTime(event.occurredAt)} {event.traceId ? `· ${event.traceId}` : ''} {event.jobType ? `· ${event.jobType}` : ''}</div><pre style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, color: 'var(--text)' }}>{event.text}</pre></div>)}</div>
            </section>)}</div>}
        </div>
    </div>;
}
