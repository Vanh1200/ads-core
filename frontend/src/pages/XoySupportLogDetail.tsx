import { Fragment, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, ClipboardCopy, ShieldAlert } from 'lucide-react';
import { xoyLicensesApi, xoySupportLogsApi } from '../api/client';
import { EMPTY_XOY_LOG_FILTERS, formatXoyLogTime, type XoyLogFilters, XoySupportLogFilters } from './XoySupportLogs';

const APPEAL_TEMPLATE_LABELS: Record<string, string> = {
    violationAbuse: 'Lách hệ thống: tạo nhiều tài khoản để lạm dụng',
    violationCircumventing: 'Lách hệ thống: kỹ thuật che giấu',
    violationLachGeneral: 'Lách hệ thống',
    violationUnacceptable: 'Hoạt động kinh doanh không được chấp nhận',
    appealCountries: 'Quốc gia chạy quảng cáo',
    appealBusinessModel: 'Mô hình kinh doanh',
    appealDomain: 'Trang web',
    appealChangeDetails: 'Thay đổi trong 3 ngày qua',
    appealResubmitChanges: 'Thay đổi từ lần kháng trước',
    appealResubmitFurtherDetails: 'Thông tin bổ sung khi gửi lại',
    appealIsOwnBusiness: 'Là chủ sở hữu/nhân viên trực tiếp',
    appealBusinessChanged: 'Doanh nghiệp thay đổi trong 3 ngày qua',
    appealUsingAffiliate: 'Tham gia chương trình liên kết',
    appealMultipleAccounts: 'Có nhiều tài khoản Google',
    appealAbuseKeywords: 'Từ khóa mẫu: tạo nhiều tài khoản',
    appealAbuseActiveDuration: 'Thời gian hoạt động web: tạo nhiều tài khoản',
    appealAbuseOtherInfo: 'Thông tin khác: tạo nhiều tài khoản',
    appealAbuseOwnsWebsite: 'Sở hữu web: tạo nhiều tài khoản',
    appealAbuseDirectBrandRelation: 'Quan hệ với thương hiệu: tạo nhiều tài khoản',
    appealAbuseManagedByOther: 'Do tổ chức khác quản lý: tạo nhiều tài khoản',
    appealCloakKeywords: 'Từ khóa mẫu: kỹ thuật che giấu',
    appealCloakActiveDuration: 'Thời gian hoạt động web: kỹ thuật che giấu',
    appealCloakOtherInfo: 'Thông tin khác: kỹ thuật che giấu',
    appealCloakOwnsWebsite: 'Sở hữu web: kỹ thuật che giấu',
    appealCloakRedirecting: 'Web chuyển hướng: kỹ thuật che giấu',
    appealBizOtherInfo: 'Thông tin khác: hoạt động kinh doanh',
    appealBizDirectBrandRelation: 'Quan hệ với thương hiệu: hoạt động kinh doanh',
    appealBizManagedByOther: 'Do tổ chức khác quản lý: hoạt động kinh doanh',
    appealBizRedirecting: 'Web chuyển hướng: hoạt động kinh doanh',
    appealBizCompromised: 'Web bị xâm nhập: hoạt động kinh doanh',
};

function formatTemplateValue(value: unknown) {
    if (value === true) return 'Có';
    if (value === false) return 'Không';
    if (value == null || value === '') return '—';
    return String(value);
}

function AppealTemplateCard({ event }: { event: any }) {
    const template = event?.eventType === 'appeal_template_started' && event?.metadata?.template;
    if (!template || typeof template !== 'object' || Array.isArray(template)) return null;
    const fields = Object.entries(template);
    if (!fields.length) return null;
    return <div style={{ marginTop: 10, padding: 12, border: '1px solid var(--secondary)', borderRadius: 6, background: 'color-mix(in srgb, var(--secondary) 8%, var(--background))' }}>
        <strong style={{ display: 'block', marginBottom: 10 }}>Mẫu kháng nghị đã dùng</strong>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 0.8fr) minmax(0, 1.6fr)', gap: '7px 12px', fontSize: 13 }}>
            {fields.map(([key, value]) => <Fragment key={key}>
                <span style={{ color: 'var(--text-muted)' }}>{APPEAL_TEMPLATE_LABELS[key] || key}</span>
                <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{formatTemplateValue(value)}</span>
            </Fragment>)}
        </div>
    </div>;
}

function copyableRun(run: any) {
    return [`=== ${run.supportId} · Run ${run.runId} · ${formatXoyLogTime(run.updatedAt)} ===`, ...run.events.map((event: any) => `[${formatXoyLogTime(event.occurredAt)}]${event.jobType ? ` [${event.jobType}]` : ''}${event.traceId ? ` ${event.traceId}` : ''}${event.success === true ? ' ✓' : event.success === false ? ' ✗' : ''}\n${event.text}${event.eventType === 'appeal_template_started' && event.metadata?.template ? `\nMẫu kháng nghị: ${JSON.stringify(event.metadata.template, null, 2)}` : ''}`)].join('\n');
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
                <div style={{ display: 'grid', gap: 8, padding: 12 }}>{run.events.map((event: any) => <div key={event.id} style={{ borderLeft: `4px solid ${event.success === false ? 'var(--danger)' : event.success === true ? 'var(--secondary)' : 'var(--border)'}`, background: 'var(--background)', padding: '10px 12px', borderRadius: 4 }}><div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{formatXoyLogTime(event.occurredAt)} {event.traceId ? `· ${event.traceId}` : ''} {event.jobType ? `· ${event.jobType}` : ''}</div><pre style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, color: 'var(--text)' }}>{event.text}</pre><AppealTemplateCard event={event} /></div>)}</div>
            </section>)}</div>}
        </div>
    </div>;
}
