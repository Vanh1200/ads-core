import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, ClipboardCopy, ShieldAlert } from 'lucide-react';
import { xoyLicensesApi, xoySupportLogsApi } from '../api/client';
import { EMPTY_XOY_LOG_FILTERS, formatXoyLogTime, type XoyLogFilters, XoySupportLogFilters } from './XoySupportLogs';

type AppealTemplate = Record<string, unknown>;
type TemplateField = [key: string, label: string];
type TemplateSection = { title: string; fields: TemplateField[] };

const VIOLATION_FIELDS: TemplateField[] = [
    ['violationAbuse', 'Lách hệ thống: Tạo nhiều tài khoản để lạm dụng'],
    ['violationCircumventing', 'Lách hệ thống: Kỹ thuật che giấu'],
    ['violationLachGeneral', 'Lách hệ thống'],
    ['violationUnacceptable', 'Các hoạt động kinh doanh không được chấp nhận'],
];

function presentFields(template: AppealTemplate, fields: TemplateField[]) {
    return fields.filter(([key]) => Object.hasOwn(template, key));
}

function appealTemplateSections(template: AppealTemplate): TemplateSection[] {
    const selectedViolations = VIOLATION_FIELDS.filter(([key]) => template[key] === true).map(([, label]) => label).join('; ') || '—';
    const sections: TemplateSection[] = [
        { title: 'Loại vi phạm cần kháng', fields: [['selectedViolations', selectedViolations]] },
        { title: 'Thông tin tài khoản', fields: presentFields(template, [
            ['appealCountries', 'Doanh nghiệp sẽ chạy quảng cáo ở quốc gia nào?'],
            ['appealBusinessModel', 'Tổ chức của bạn hoạt động theo mô hình kinh doanh nào?'],
            ['appealIsOwnBusiness', 'Bạn có phải là chủ sở hữu hoặc nhân viên trực tiếp của tổ chức mà bạn quảng cáo không?'],
            ['appealDomain', 'Trang web của tổ chức bạn là gì?'],
            ['appealBusinessChanged', 'Tổ chức của bạn có gì thay đổi trong 3 ngày qua không?'],
            ...(template.appealBusinessChanged === true ? [['appealChangeDetails', 'Điều gì đã thay đổi?'] as TemplateField] : []),
            ['appealUsingAffiliate', 'Tổ chức của bạn có tham gia chương trình liên kết nào không?'],
            ['appealMultipleAccounts', 'Bạn có nhiều Tài khoản Google không?'],
        ]) },
    ];
    if (template.appealResubmitChanges || template.appealResubmitFurtherDetails) sections.push({ title: 'Thông tin gửi lại sau khi đơn cũ bị từ chối', fields: presentFields(template, [
        ['appealResubmitChanges', 'Bạn đã thực hiện những thay đổi nào kể từ lần gửi đơn gần nhất?'],
        ['appealResubmitFurtherDetails', 'Có thông tin nào khác chưa được đưa vào đơn lần trước không?'],
    ]) });
    if (template.violationAbuse === true) sections.push({ title: 'Lách hệ thống: Tạo nhiều tài khoản để lạm dụng', fields: presentFields(template, [
        ['appealAbuseKeywords', 'Một số từ khoá mẫu trong chiến dịch của bạn là gì?'],
        ['appealAbuseOwnsWebsite', 'Tổ chức của bạn có sở hữu trang web này không?'],
        ['appealAbuseActiveDuration', 'Trang web của bạn đã hoạt động được bao lâu?'],
        ['appealAbuseDirectBrandRelation', 'Doanh nghiệp có mối quan hệ trực tiếp với các thương hiệu khác trên web không?'],
        ['appealAbuseManagedByOther', 'Doanh nghiệp này có do một tổ chức khác quản lý không?'],
        ['appealAbuseOtherInfo', 'Có thông tin nào khác cần biết về bạn hoặc tổ chức không?'],
    ]) });
    if (template.violationCircumventing === true || template.violationLachGeneral === true) sections.push({ title: 'Lách hệ thống: General / Kỹ thuật che giấu', fields: presentFields(template, [
        ['appealCloakKeywords', 'Một số từ khoá mẫu trong chiến dịch của bạn là gì?'],
        ['appealCloakOwnsWebsite', 'Tổ chức của bạn có sở hữu trang web này không?'],
        ['appealCloakActiveDuration', 'Trang web của bạn đã hoạt động được bao lâu?'],
        ['appealCloakRedirecting', 'Trang web của bạn có chuyển hướng đến một trang web khác không?'],
        ['appealCloakOtherInfo', 'Có thông tin nào khác cần biết về bạn hoặc tổ chức không?'],
    ]) });
    if (template.violationUnacceptable === true) sections.push({ title: 'Các hoạt động kinh doanh không được chấp nhận', fields: presentFields(template, [
        ['appealBizDirectBrandRelation', 'Doanh nghiệp có mối quan hệ trực tiếp với các thương hiệu khác trên web không?'],
        ['appealBizManagedByOther', 'Doanh nghiệp này có do một tổ chức khác quản lý không?'],
        ['appealBizRedirecting', 'Trang web của bạn có chuyển hướng đến một trang web khác không?'],
        ['appealBizCompromised', 'Trang web của tổ chức bạn có bị xâm nhập không?'],
        ['appealBizOtherInfo', 'Có thông tin nào khác cần biết về bạn hoặc tổ chức không?'],
    ]) });
    return sections.filter((section) => section.fields.length);
}

function formatTemplateValue(value: unknown) {
    if (value === true) return 'Có';
    if (value === false) return 'Không';
    if (value == null || value === '') return '—';
    return String(value);
}

function jobStatusLabel(status: unknown) {
    return ({ COMPLETED: 'Hoàn tất', FAILED: 'Thất bại', STOPPED: 'Đã dừng', INTERRUPTED: 'Gián đoạn', RUNNING: 'Đang chạy' } as Record<string, string>)[String(status || '')] || 'Đang chạy';
}

function RunProgressSummary({ run }: { run: any }) {
    const total = Math.max(0, Number(run.targetTotal) || 0);
    const processed = Math.min(total || Number(run.processedTargets) || 0, Math.max(0, Number(run.processedTargets) || 0));
    const percent = total ? Math.round((processed / total) * 100) : null;
    return <div aria-live="polite" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--border)', background: 'var(--background)', fontSize: 13 }}>
        <span className="badge badge-info">Trạng thái: {jobStatusLabel(run.jobStatus)}</span>
        <span className="badge badge-secondary">Tiến độ: {total ? `${processed}/${total}${percent != null ? ` (${percent}%)` : ''}` : 'Chưa nhận tiến độ'}</span>
        <span style={{ color: 'var(--text-secondary)' }}>Kết quả: {Number(run.successfulTargets) || 0} thành công · {Number(run.failedTargets) || 0} lỗi · {Number(run.skippedTargets) || 0} bỏ qua</span>
    </div>;
}

function AppealTemplateCard({ event }: { event: any }) {
    const template = event?.eventType === 'appeal_template_started' && event?.metadata?.template;
    if (!template || typeof template !== 'object' || Array.isArray(template)) return null;
    const sections = appealTemplateSections(template as AppealTemplate);
    if (!sections.length) return null;
    return <div style={{ marginTop: 10, padding: 12, border: '1px solid var(--secondary)', borderRadius: 6, background: 'color-mix(in srgb, var(--secondary) 8%, var(--background))' }}>
        <strong style={{ display: 'block', marginBottom: 10 }}>Mẫu kháng nghị đã dùng</strong>
        <div style={{ display: 'grid', gap: 14 }}>{sections.map((section) => <section key={section.title}>
            <strong style={{ display: 'block', fontSize: 13, marginBottom: 7 }}>{section.title}</strong>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 0.8fr) minmax(0, 1.6fr)', gap: '7px 12px', fontSize: 13 }}>
                {section.fields.map(([key, label]) => <Fragment key={key}><span style={{ color: 'var(--text-muted)' }}>{label}</span><span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{formatTemplateValue(key === 'selectedViolations' ? label : template[key])}</span></Fragment>)}
            </div>
        </section>)}</div>
    </div>;
}

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
    const [searchParams] = useSearchParams();
    const supportIdFromUrl = searchParams.get('supportId')?.trim() || '';
    const [filters, setFilters] = useState<XoyLogFilters>(() => ({ ...EMPTY_XOY_LOG_FILTERS, supportId: searchParams.get('supportId') || '' }));
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(30);
    const [copied, setCopied] = useState<string | null>(null);
    // React keeps this screen mounted when only ?supportId changes. Sync that
    // URL state so a click from the customer's job list actually opens the
    // selected job detail rather than leaving the previous list rendered.
    useEffect(() => {
        setFilters((current) => current.supportId.trim() === supportIdFromUrl ? current : { ...EMPTY_XOY_LOG_FILTERS, supportId: supportIdFromUrl });
        setPage(1);
    }, [supportIdFromUrl]);
    const licenses = useQuery({ queryKey: ['xoy-licenses'], queryFn: xoyLicensesApi.list });
    const supportId = filters.supportId.trim();
    const isSingleSupport = /^SUP-[A-Z0-9]+$/i.test(supportId);
    const logs = useQuery({
        queryKey: ['xoy-license-support-logs', licenseId, filters, page, limit],
        queryFn: () => isSingleSupport
            ? xoySupportLogsApi.get(supportId, { traceId: filters.traceId || undefined, jobType: filters.jobType || undefined, page, limit })
            : xoySupportLogsApi.listByLicense(licenseId!, { ...filters, page, limit }),
        enabled: Boolean(licenseId),
        refetchInterval: 15_000,
    });
    const license = (licenses.data?.data || []).find((item: any) => item.id === licenseId);
    const detailRun = isSingleSupport ? logs.data?.data?.data : null;
    const runs = isSingleSupport ? (detailRun ? [detailRun] : []) : (logs.data?.data?.data || []);
    const pagination = logs.data?.data?.pagination || null;
    const knownTypes = useMemo<string[]>(() => [...new Set<string>(runs.map((run: any) => run.jobType).filter(Boolean))].sort(), [runs]);
    const copy = async (key: string, text: string) => { await navigator.clipboard.writeText(text); setCopied(key); };
    const applyFilters = (next: XoyLogFilters) => { setFilters(next); setPage(1); };
    return <div>
        <div className="page-header" style={{ alignItems: 'center' }}><div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><button className="btn btn-secondary" onClick={() => navigate('/xoy-support-logs')}><ArrowLeft size={16} />Quay lại</button><div><h1 className="page-title">Support log · {license?.name || 'Đang tải...'}</h1><p className="page-subtitle">{license?.telegramId ? `Telegram: ${license.telegramId} · ` : ''}{isSingleSupport ? `Chi tiết job ${supportId}.` : 'Danh sách job của khách hàng. Chọn Chi tiết để xem nhật ký từng job.'}</p></div></div>{isSingleSupport && <button className="btn btn-primary" disabled={!runs.length} onClick={() => copy('all', copyableAll(license, runs))}>{copied === 'all' ? <Check size={16} /> : <ClipboardCopy size={16} />}{copied === 'all' ? 'Đã sao chép' : 'Copy log trang này'}</button>}</div>
        <XoySupportLogFilters value={filters} jobTypes={knownTypes} onApply={applyFilters} />
        <div className="card"><div className="card-header"><ShieldAlert size={18} />{isSingleSupport ? 'Chi tiết support log' : 'Danh sách job của khách hàng'}</div>
            {logs.isLoading ? <div style={{ padding: 20 }}>Đang tải log...</div> : logs.isError ? <div style={{ padding: 20, color: 'var(--danger)' }}>Không tải được support log.</div> : runs.length === 0 ? <div style={{ padding: 20 }}>Không có log phù hợp với bộ lọc hiện tại.</div> : <div style={{ padding: 16, display: 'grid', gap: 14 }}>{runs.map((run: any) => <section key={run.id} className="card" style={{ margin: 0, overflow: 'hidden' }}>
                <div className="card-header" style={{ justifyContent: 'space-between', gap: 12 }}><span><strong>{run.supportId}</strong> · {run.jobType || 'Job XOY'} · {isSingleSupport && pagination ? `${pagination.total} sự kiện · ` : ''}{formatXoyLogTime(run.updatedAt)}</span>{isSingleSupport ? <button className="btn btn-secondary btn-sm" onClick={() => copy(run.id, copyableRun(run))}>{copied === run.id ? <Check size={15} /> : <ClipboardCopy size={15} />}{copied === run.id ? 'Đã sao chép' : 'Copy trang này'}</button> : <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/xoy-support-logs/${encodeURIComponent(licenseId || '')}?supportId=${encodeURIComponent(run.supportId)}`)}>Chi tiết</button>}</div>
                <RunProgressSummary run={run} />
                {isSingleSupport && <div style={{ display: 'grid', gap: 8, padding: 12 }}>{run.events.map((event: any) => <div key={event.id} style={{ borderLeft: `4px solid ${event.success === false ? 'var(--danger)' : event.success === true ? 'var(--secondary)' : 'var(--border)'}`, background: 'var(--background)', padding: '10px 12px', borderRadius: 4 }}><div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{formatXoyLogTime(event.occurredAt)} {event.traceId ? `· ${event.traceId}` : ''} {event.jobType ? `· ${event.jobType}` : ''}</div><pre style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, color: 'var(--text)' }}>{event.text}</pre><AppealTemplateCard event={event} /></div>)}</div>}
            </section>)}</div>}
            {pagination?.total > 0 && <div className="pagination-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '0 16px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{isSingleSupport ? 'Số dòng hiển thị:' : 'Số job hiển thị:'}</span><select className="form-select" style={{ width: 'auto', padding: '4px 8px', fontSize: 13 }} value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setPage(1); }}><option value={10}>10</option><option value={20}>20</option><option value={30}>30</option><option value={50}>50</option><option value={100}>100</option></select><span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{((page - 1) * limit) + 1} - {Math.min(page * limit, pagination.total)} trong tổng số {pagination.total}</span></div>
                <div className="pagination"><button className="pagination-btn" disabled={page <= 1} onClick={() => setPage(1)}>← Đến trang đầu</button><button className="pagination-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Trước</button><span className="pagination-info">Trang {page} / {pagination.totalPages}</span><button className="pagination-btn" disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)}>Sau →</button><button className="pagination-btn" disabled={page >= pagination.totalPages} onClick={() => setPage(pagination.totalPages)}>Đến trang cuối →</button></div>
            </div>}
        </div>
    </div>;
}
