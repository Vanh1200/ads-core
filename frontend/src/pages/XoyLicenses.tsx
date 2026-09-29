import { Fragment, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, ChevronUp, Copy, Eye, EyeOff, Key, MonitorX, Plus } from 'lucide-react';
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
    const signal = device.fingerprintSignals || {};
    return `${signal.os || '—'} · ${signal.arch || '—'} / ${signal.naclArch || '—'} · ${signal.hardwareConcurrency || '—'} CPU · ${signal.deviceMemory || '—'} GB RAM`;
}

function fingerprintV2Details(device: any) {
    const signal = device.fingerprintSignals || {};
    const capabilities = signal.webglCapabilities || {};
    const dimensions = Array.isArray(capabilities.maxViewportDimensions) && capabilities.maxViewportDimensions.length
        ? capabilities.maxViewportDimensions.join(' × ')
        : '—';
    return {
        canvas: signal.canvasFingerprint || '—',
        webglCapabilities: `${capabilities.version || '—'} · GLSL ${capabilities.shadingLanguageVersion || '—'} · texture ${capabilities.maxTextureSize || '—'} · viewport ${dimensions} · ${capabilities.extensionCount ?? '—'} extensions`,
        uaClientHints: `${signal.userAgentPlatform || '—'} · ${signal.userAgentArchitecture || '—'} · ${signal.userAgentBitness || '—'}-bit`,
    };
}

export default function XoyLicenses() {
    const queryClient = useQueryClient();
    const [issuedKey, setIssuedKey] = useState('');
    const [copied, setCopied] = useState(false);
    const [openLicenseId, setOpenLicenseId] = useState<string | null>(null);
    const [revealedKeys, setRevealedKeys] = useState<Record<string, string>>({});
    const { data, isLoading } = useQuery({ queryKey: ['xoy-licenses'], queryFn: xoyLicensesApi.list });
    const devices = useQuery({ queryKey: ['xoy-license-devices', openLicenseId], queryFn: () => xoyLicensesApi.listDevices(openLicenseId!).then((result) => result.data), enabled: Boolean(openLicenseId) });
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
    const licenses = data?.data || [];

    const issuedKeyBlock = useMemo(() => issuedKey && <div style={{ margin: '0 16px 16px', padding: 14, background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 8, color: '#064e3b' }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Đã cấp key — gửi key này cho khách</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <code style={{ color: '#111827', background: '#ffffff', border: '1px solid #a7f3d0', borderRadius: 6, padding: '8px 10px', fontSize: 16, fontWeight: 700, letterSpacing: '.04em' }}>{issuedKey}</code>
            <button type="button" className="btn btn-secondary" onClick={async () => { await navigator.clipboard.writeText(issuedKey); setCopied(true); }}>
                {copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Đã sao chép' : 'Sao chép'}
            </button>
        </div>
        <small style={{ display: 'block', marginTop: 8 }}>License đang ở trạng thái chưa active. Khi khách kích hoạt trong extension, fingerprint và Chrome profile sẽ hiện bên dưới.</small>
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

    return <div>
        <div className="page-header"><div><h1 className="page-title">XOY Licenses</h1><p className="page-subtitle">Cấp key theo gói và quản lý fingerprint đã kích hoạt từ Ads Core.</p></div></div>
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
        <div className="card"><div className="table-container"><table className="data-table"><thead><tr><th>Khách hàng</th><th>Gói</th><th>License key</th><th>Fingerprint active</th><th>Hết hạn</th><th>Trạng thái</th><th></th></tr></thead><tbody>
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
                        <td><button className="btn btn-secondary" onClick={() => setOpenLicenseId(isOpen ? null : license.id)}>{isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}{isOpen ? 'Ẩn' : 'Thiết bị'}</button></td>
                    </tr>
                    {isOpen && <tr key={`${license.id}-devices`}><td colSpan={7} style={{ padding: 16, background: 'var(--background)' }}>
                        {devices.isLoading ? 'Đang tải fingerprint...' : devices.isError ? 'Không thể tải fingerprint.' : (devices.data || []).length === 0 ? 'Chưa có fingerprint nào kích hoạt license này.' : <div style={{ display: 'grid', gap: 12 }}>{devices.data.map((device: any) => {
                            const details = fingerprintV2Details(device);
                            return <div key={device.id} style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}><div><strong>{device.fingerprint}</strong><small style={{ display: 'block' }}>{signalSummary(device)}</small></div><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><small>{device.status} · dùng lần cuối {new Date(device.lastSeenAt).toLocaleString('vi-VN')}</small>{device.status !== 'REVOKED' && <button className="btn btn-danger" disabled={revoke.isPending} onClick={() => window.confirm(`Thu hồi ${device.fingerprint}? Toàn bộ Chrome profile thuộc fingerprint này sẽ bị dừng.`) && revoke.mutate({ licenseId: license.id, deviceId: device.id })}><MonitorX size={15} />Thu hồi</button>}</div></div>
                            <div style={{ marginTop: 8, fontSize: 12 }}>Extension: {device.extensionMetadata?.name || '—'} {device.extensionMetadata?.version || ''} · MV{device.extensionMetadata?.manifestVersion || '—'} · {device.extensionMetadata?.id || '—'}</div>
                            <div style={{ marginTop: 4, fontSize: 12, overflowWrap: 'anywhere' }}>WebGL: {device.fingerprintSignals?.webglVendor || '—'} · {device.fingerprintSignals?.webglRenderer || '—'}</div>
                            <div style={{ marginTop: 4, fontSize: 12, overflowWrap: 'anywhere' }}>Canvas hash: {details.canvas}</div>
                            <div style={{ marginTop: 4, fontSize: 12, overflowWrap: 'anywhere' }}>WebGL capabilities: {details.webglCapabilities}</div>
                            <div style={{ marginTop: 4, fontSize: 12 }}>UA architecture: {details.uaClientHints}</div>
                            <div style={{ marginTop: 4, fontSize: 12, overflowWrap: 'anywhere' }}>User agent: {device.userAgent || '—'}</div>
                            <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>{device.sessions.map((session: any) => <small key={session.id}>{profileName(session.installationId)} · hoạt động {new Date(session.lastSeenAt).toLocaleString('vi-VN')}</small>)}</div>
                        </div>;
                        })}</div>}
                    </td></tr>}</Fragment>;
            })}
        </tbody></table></div></div>
    </div>;
}
