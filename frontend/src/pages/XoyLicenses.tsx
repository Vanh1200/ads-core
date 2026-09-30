import { Fragment, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, ChevronUp, Copy, Eye, EyeOff, Key, MonitorX, Pencil, Plus, Save, X } from 'lucide-react';
import { xoyLicensesApi } from '../api/client';

const PLAN_LABELS = {
    BASIC: 'Cơ bản · Kháng nghị, Xác minh, Kích hoạt lại, Đổi tên',
    FULL: 'Full · Toàn bộ tính năng XOY',
} as const;

function expiresAfterMonths(months: number) {
    const date = new Date();
    date.setMonth(date.getMonth() + months);
    return date.toISOString().slice(0, 10);
}

function profileName(installationId: string) {
    return `Chrome profile · ...${installationId.slice(-4)}`;
}

function signalSummary(device: any) {
    const context = device.deviceContext || {};
    return `${context.os || '—'} · ${context.architecture || '—'} / ${context.naclArchitecture || '—'} · ${context.logicalCpuCount || '—'} CPU · ${context.memoryGiB || '—'} GB RAM`;
}

function deviceContextDetails(device: any) {
    const context = device.deviceContext || {};
    const capabilities = context.webglProfile || {};
    const dimensions = Array.isArray(capabilities.maxViewportDimensions) && capabilities.maxViewportDimensions.length
        ? capabilities.maxViewportDimensions.join(' × ')
        : '—';
    return {
        canvas: context.canvasToken || '—',
        webglCapabilities: `${capabilities.version || '—'} · GLSL ${capabilities.shadingLanguageVersion || '—'} · texture ${capabilities.maxTextureSize || '—'} · viewport ${dimensions} · ${capabilities.extensionCount ?? '—'} extensions`,
        uaClientHints: `${context.browserPlatform || '—'} · ${context.browserArchitecture || '—'} · ${context.browserBitness || '—'}-bit`,
    };
}

export default function XoyLicenses() {
    const queryClient = useQueryClient();
    const [issuedKey, setIssuedKey] = useState('');
    const [copied, setCopied] = useState(false);
    const [openLicenseId, setOpenLicenseId] = useState<string | null>(null);
    const [editingLicenseId, setEditingLicenseId] = useState<string | null>(null);
    const [revealedKeys, setRevealedKeys] = useState<Record<string, string>>({});
    const { data, isLoading } = useQuery({ queryKey: ['xoy-licenses'], queryFn: xoyLicensesApi.list });
    const devices = useQuery({ queryKey: ['xoy-license-devices', openLicenseId], queryFn: () => xoyLicensesApi.listDevices(openLicenseId!).then((result) => result.data), enabled: Boolean(openLicenseId) });
    const audits = useQuery({ queryKey: ['xoy-license-device-audits', openLicenseId], queryFn: () => xoyLicensesApi.listDeviceAudits(openLicenseId!).then((result) => result.data), enabled: Boolean(openLicenseId) });
    const create = useMutation({
        mutationFn: xoyLicensesApi.create,
        onSuccess: (result) => {
            setIssuedKey(result.data.licenseKey);
            setCopied(false);
            queryClient.invalidateQueries({ queryKey: ['xoy-licenses'] });
        },
    });
    const revealKey = useMutation({
        mutationFn: (licenseId: string) => xoyLicensesApi.getKey(licenseId).then((result) => ({ licenseId, licenseKey: result.data.licenseKey })),
        onSuccess: ({ licenseId, licenseKey }) => setRevealedKeys((current) => ({ ...current, [licenseId]: licenseKey })),
    });
    const revoke = useMutation({
        mutationFn: ({ licenseId, deviceId }: { licenseId: string; deviceId: string }) => xoyLicensesApi.revokeDevice(licenseId, deviceId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['xoy-licenses'] });
            queryClient.invalidateQueries({ queryKey: ['xoy-license-devices', openLicenseId] });
        },
    });
    const updateLicense = useMutation({
        mutationFn: ({ licenseId, values }: { licenseId: string; values: { plan: 'BASIC' | 'FULL'; maxFingerprints: number; expiresAt: string | null } }) => xoyLicensesApi.update(licenseId, values),
        onSuccess: () => {
            setEditingLicenseId(null);
            queryClient.invalidateQueries({ queryKey: ['xoy-licenses'] });
            queryClient.invalidateQueries({ queryKey: ['xoy-license-device-audits', openLicenseId] });
        },
    });
    const revokeAllDevices = useMutation({
        mutationFn: (licenseId: string) => xoyLicensesApi.revokeAllDevices(licenseId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['xoy-licenses'] });
            queryClient.invalidateQueries({ queryKey: ['xoy-license-devices', openLicenseId] });
            queryClient.invalidateQueries({ queryKey: ['xoy-license-device-audits', openLicenseId] });
        },
    });
    const licenses = data?.data || [];

    const issuedKeyBlock = useMemo(() => issuedKey && <div style={{ margin: '0 16px 16px', padding: 14, background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 8, color: '#064e3b' }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Đã cấp key — gửi key này cho khách</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <code style={{ color: '#111827', background: '#ffffff', border: '1px solid #a7f3d0', borderRadius: 6, padding: '8px 10px', fontSize: 16, fontWeight: 700, letterSpacing: '.04em' }}>{issuedKey}</code>
            <button type="button" className="btn btn-secondary" onClick={async () => { await navigator.clipboard.writeText(issuedKey); setCopied(true); }}>
                {copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Đã sao chép' : 'Sao chép'}
            </button>
        </div>
        <small style={{ display: 'block', marginTop: 8 }}>License đang ở trạng thái chưa active. Khi khách kích hoạt trong extension, thông tin thiết bị và Chrome profile sẽ hiện bên dưới.</small>
    </div>, [issuedKey, copied]);

    const submit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        const months = Number(values.get('durationMonths') || 6);
        create.mutate({
            name: String(values.get('name') || ''),
            telegramId: String(values.get('telegramId') || '') || undefined,
            plan: String(values.get('plan') || 'BASIC') === 'FULL' ? 'FULL' : 'BASIC',
            maxFingerprints: Number(values.get('maxFingerprints') || 3),
            expiresAt: expiresAfterMonths(months),
        });
    };

    const submitEdit = (event: React.FormEvent<HTMLFormElement>, licenseId: string) => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        updateLicense.mutate({
            licenseId,
            values: {
                plan: values.get('plan') === 'FULL' ? 'FULL' : 'BASIC',
                maxFingerprints: Number(values.get('maxFingerprints')),
                expiresAt: String(values.get('expiresAt') || '') || null,
            },
        });
    };

    return <div>
        <div className="page-header"><div><h1 className="page-title">XOY Licenses</h1><p className="page-subtitle">Cấp key theo gói và quản lý thiết bị đã kích hoạt từ Ads Core.</p></div></div>
        <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header"><Key size={18} /> Cấp license mới</div>
            <form onSubmit={submit} style={{ padding: 16 }}>
                <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
                    <div><label className="form-label">Tên khách hàng / gói *</label><input className="form-input" name="name" required placeholder="Ví dụ: Nguyễn Văn A" /></div>
                    <div><label className="form-label">Telegram ID</label><input className="form-input" name="telegramId" placeholder="Không bắt buộc" /></div>
                    <div><label className="form-label">Gói license *</label><select className="form-select" name="plan" defaultValue="BASIC"><option value="BASIC">Gói Cơ bản</option><option value="FULL">Gói Full</option></select></div>
                    <div><label className="form-label">Số thiết bị tối đa *</label><input className="form-input" name="maxFingerprints" required type="number" min="1" max="100" defaultValue="3" /></div>
                    <div><label className="form-label">Thời hạn *</label><select className="form-select" name="durationMonths" defaultValue="6"><option value="1">1 tháng</option><option value="6">6 tháng</option><option value="12">1 năm</option></select></div>
                </div>
                <div style={{ marginTop: 16 }}><button className="btn btn-primary" disabled={create.isPending}><Plus size={16} />{create.isPending ? 'Đang cấp...' : 'Cấp key'}</button></div>
            </form>
            {issuedKeyBlock}
            {create.isError && <div style={{ margin: '0 16px 16px', color: 'var(--danger)' }}>Không thể cấp license. Kiểm tra lại thông tin.</div>}
        </div>
        <div className="card"><div className="table-container"><table className="data-table"><thead><tr><th>Khách hàng</th><th>Gói</th><th>License key</th><th>Thiết bị active</th><th>Hết hạn</th><th>Trạng thái</th><th></th></tr></thead><tbody>
            {isLoading ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: 28 }}>Đang tải...</td></tr> : licenses.map((license: any) => {
                const visibleKey = revealedKeys[license.id];
                const isOpen = openLicenseId === license.id;
                return <Fragment key={license.id}>
                    <tr key={license.id}>
                        <td><strong>{license.name}</strong>{license.telegramId && <small style={{ display: 'block' }}>Telegram: {license.telegramId}</small>}</td>
                        <td>{PLAN_LABELS[license.plan as keyof typeof PLAN_LABELS] || license.plan}</td>
                        <td><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><code>{visibleKey || `${license.keyPrefix}...`}</code>{visibleKey ? <button className="icon-btn" title="Ẩn key" onClick={() => setRevealedKeys((current) => { const next = { ...current }; delete next[license.id]; return next; })}><EyeOff size={15} /></button> : <button className="icon-btn" title="Hiện key" disabled={!license.keyAvailable || revealKey.isPending} onClick={() => revealKey.mutate(license.id)}><Eye size={15} /></button>}{visibleKey && <button className="icon-btn" title="Sao chép key" onClick={() => navigator.clipboard.writeText(visibleKey)}><Copy size={15} /></button>}</div></td>
                        <td>{license.activeFingerprints}/{license.maxFingerprints}</td>
                        <td>{license.expiresAt ? new Date(license.expiresAt).toLocaleDateString('vi-VN') : '—'}</td>
                        <td>{license.status === 'ISSUED' ? 'CHƯA ACTIVE' : license.status}</td>
                        <td><button className="btn btn-secondary" onClick={() => { setOpenLicenseId(isOpen ? null : license.id); if (isOpen) setEditingLicenseId(null); }}>{isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}{isOpen ? 'Ẩn' : 'Quản lý'}</button></td>
                    </tr>
                    {isOpen && <tr key={`${license.id}-devices`}><td colSpan={7} style={{ padding: 16, background: 'var(--background)' }}>
                        <div className="card" style={{ marginBottom: 16 }}>
                            <div className="card-header" style={{ justifyContent: 'space-between' }}>
                                <span>Quản lý license · {license.name}</span>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    {editingLicenseId !== license.id && <button className="btn btn-secondary" onClick={() => setEditingLicenseId(license.id)}><Pencil size={15} />Sửa license</button>}
                                    <button className="btn btn-danger" disabled={revokeAllDevices.isPending} onClick={() => window.confirm('Thu hồi toàn bộ thiết bị của license này? Mọi Chrome profile đang dùng key sẽ bị dừng. License và key vẫn giữ nguyên để kích hoạt lại khi cần.') && revokeAllDevices.mutate(license.id)}><MonitorX size={15} />{revokeAllDevices.isPending ? 'Đang thu hồi...' : 'Thu hồi tất cả thiết bị'}</button>
                                </div>
                            </div>
                            {editingLicenseId === license.id ? <form onSubmit={(event) => submitEdit(event, license.id)} style={{ padding: 16 }}>
                                <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
                                    <div><label className="form-label">Gói license</label><select className="form-select" name="plan" defaultValue={license.plan}><option value="BASIC">Gói Cơ bản</option><option value="FULL">Gói Full</option></select></div>
                                    <div><label className="form-label">Số thiết bị tối đa</label><input className="form-input" name="maxFingerprints" type="number" min="1" max="100" required defaultValue={license.maxFingerprints} /></div>
                                    <div><label className="form-label">Hết hạn</label><input className="form-input" name="expiresAt" type="date" defaultValue={license.expiresAt ? new Date(license.expiresAt).toISOString().slice(0, 10) : ''} /></div>
                                </div>
                                <small style={{ display: 'block', marginTop: 10, color: 'var(--text-muted)' }}>Không thể giảm giới hạn thấp hơn số thiết bị đang active. Hãy thu hồi thiết bị trước.</small>
                                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}><button className="btn btn-primary" disabled={updateLicense.isPending}><Save size={15} />{updateLicense.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}</button><button type="button" className="btn btn-secondary" onClick={() => setEditingLicenseId(null)}><X size={15} />Hủy</button></div>
                                {updateLicense.isError && <div style={{ marginTop: 12, color: 'var(--danger)' }}>{(updateLicense.error as any)?.response?.data?.error || 'Không thể lưu thay đổi license.'}</div>}
                            </form> : <div style={{ padding: '0 16px 16px', display: 'flex', flexWrap: 'wrap', gap: 18, color: 'var(--text-muted)', fontSize: 13 }}>
                                <span><strong style={{ color: 'var(--text)' }}>Gói:</strong> {PLAN_LABELS[license.plan as keyof typeof PLAN_LABELS] || license.plan}</span>
                                <span><strong style={{ color: 'var(--text)' }}>Thiết bị:</strong> {license.activeFingerprints}/{license.maxFingerprints}</span>
                                <span><strong style={{ color: 'var(--text)' }}>Hết hạn:</strong> {license.expiresAt ? new Date(license.expiresAt).toLocaleDateString('vi-VN') : 'Không giới hạn'}</span>
                            </div>}
                            {revokeAllDevices.isError && <div style={{ margin: '0 16px 16px', color: 'var(--danger)' }}>{(revokeAllDevices.error as any)?.response?.data?.error || 'Không thể thu hồi thiết bị.'}</div>}
                        </div>
                        {devices.isLoading ? 'Đang tải thiết bị...' : devices.isError ? 'Không thể tải thiết bị.' : (devices.data || []).length === 0 ? 'Chưa có thiết bị nào kích hoạt license này.' : <div style={{ display: 'grid', gap: 12 }}>{devices.data.map((device: any) => {
                            const details = deviceContextDetails(device);
                            return <div key={device.id} style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}><div><strong>Thiết bị · từ {new Date(device.firstSeenAt).toLocaleDateString('vi-VN')}</strong><small style={{ display: 'block' }}>{signalSummary(device)}</small></div><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><small>{device.status} · dùng lần cuối {new Date(device.lastSeenAt).toLocaleString('vi-VN')}</small>{device.status !== 'REVOKED' && <button className="btn btn-danger" disabled={revoke.isPending} onClick={() => window.confirm('Thu hồi thiết bị này? Toàn bộ Chrome profile thuộc thiết bị sẽ bị dừng.') && revoke.mutate({ licenseId: license.id, deviceId: device.id })}><MonitorX size={15} />Thu hồi</button>}</div></div>
                            <div style={{ marginTop: 8, fontSize: 12 }}>Extension: {device.extensionMetadata?.name || '—'} {device.extensionMetadata?.version || ''} · MV{device.extensionMetadata?.manifestVersion || '—'} · {device.extensionMetadata?.id || '—'}</div>
                            <div style={{ marginTop: 4, fontSize: 12, overflowWrap: 'anywhere' }}>WebGL: {device.deviceContext?.webglVendor || '—'} · {device.deviceContext?.webglRenderer || '—'}</div>
                            <div style={{ marginTop: 4, fontSize: 12, overflowWrap: 'anywhere' }}>Canvas token: {details.canvas}</div>
                            <div style={{ marginTop: 4, fontSize: 12, overflowWrap: 'anywhere' }}>WebGL capabilities: {details.webglCapabilities}</div>
                            <div style={{ marginTop: 4, fontSize: 12 }}>UA architecture: {details.uaClientHints}</div>
                            <div style={{ marginTop: 4, fontSize: 12, overflowWrap: 'anywhere' }}>User agent: {device.userAgent || '—'}</div>
                            <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>{device.sessions.map((session: any) => <small key={session.id}>{profileName(session.installationId)} · hoạt động {new Date(session.lastSeenAt).toLocaleString('vi-VN')}</small>)}</div>
                        </div>;
                        })}</div>}
                        <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}><strong>Nhật ký bảo mật thiết bị</strong>{audits.isLoading ? <small style={{ display: 'block', marginTop: 8 }}>Đang tải...</small> : (audits.data || []).length === 0 ? <small style={{ display: 'block', marginTop: 8 }}>Chưa có thay đổi hoặc proof lỗi.</small> : <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>{audits.data.map((audit: any) => <small key={audit.id}><strong>{audit.eventType}</strong> · {new Date(audit.createdAt).toLocaleString('vi-VN')}</small>)}</div>}</div>
                    </td></tr>}</Fragment>;
            })}
        </tbody></table></div></div>
    </div>;
}
