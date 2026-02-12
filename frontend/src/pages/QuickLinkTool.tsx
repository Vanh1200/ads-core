import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
    Link,
    Plus,
    Trash2,
    AlertCircle,
    X,
    ArrowRight
} from 'lucide-react';
import { creditLinkingApi, invoiceMCCsApi, partnersApi } from '../api/client';
import ConfirmModal from '../components/ConfirmModal';

interface Requirement {
    id: string;
    timezone: string;
    currency: string;
    year: number;
    count: number;
}

interface Account {
    id: string;
    name: string;
    accountName: string;
    googleAccountId: string;
    timezone: string;
    currency: string;
    batchName: string;
    readiness: number;
}



// Reusable Components for "New Order" Style
const Label = ({ children, style }: { children: React.ReactNode, style?: React.CSSProperties }) => (
    <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8, ...style }}>
        {children}
    </label>
);

const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
        {...props}
        className="form-control"
        style={{
            height: 42,
            backgroundColor: 'var(--input-bg, rgba(0, 0, 0, 0.5))', // Unified dark background
            border: '1px solid var(--border-color)',
            borderRadius: 8,
            color: 'var(--text-primary)',
            fontSize: 14,
            width: '100%',
            padding: '0 12px',
            transition: 'border-color 0.2s',
            ...props.style
        }}
    />
);

const Select = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select
        {...props}
        className="form-control"
        style={{
            height: 42,
            backgroundColor: 'var(--input-bg, rgba(0, 0, 0, 0.5))', // Unified dark background
            border: '1px solid var(--border-color)',
            borderRadius: 8,
            color: 'var(--text-primary)',
            fontSize: 14,
            width: '100%',
            padding: '0 12px',
            cursor: 'pointer',
            ...props.style
        }}
    >
        {props.children}
    </select>
);

export default function QuickLinkTool() {
    const navigate = useNavigate();

    // Requirements
    const [requirements, setRequirements] = useState<Requirement[]>([
        { id: Math.random().toString(36).substr(2, 9), timezone: 'UTC+8', currency: 'USD', year: 2025, count: 5 }
    ]);

    // Suggestions State
    const [suggestions, setSuggestions] = useState<any[] | null>(null);
    const [selectedLinks, setSelectedLinks] = useState<Record<string, any>>({}); // Maps requirementId to selected link (batch + accounts)

    // Destination State
    const [targetType, setTargetType] = useState<'EXISTING' | 'NEW'>('EXISTING');
    const [selectedMiId, setSelectedMiId] = useState<string>('');
    const [newMiData, setNewMiData] = useState({
        name: '',
        mccInvoiceId: '',
        partnerId: ''
    });

    // Toast State
    const [toast, setToast] = useState<{ message: string, type: 'error' | 'success' } | null>(null);

    // Auto-hide toast
    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    const showToast = (message: string, type: 'error' | 'success' = 'error') => {
        setToast({ message, type });
    };

    const [isExecuting, setIsExecuting] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    // Fetch existing MIs and Partners
    const { data: misData } = useQuery({
        queryKey: ['invoice-mccs-simple'],
        queryFn: () => invoiceMCCsApi.list({ limit: 1000 }).then(res => res.data.data),
    });

    const { data: partnersData } = useQuery({
        queryKey: ['partners-simple'],
        queryFn: () => partnersApi.list({ type: 'INVOICE_PROVIDER', limit: 1000 }).then(res => res.data.data),
    });

    // Mutations
    const suggestMutation = useMutation({
        mutationFn: (reqs: any[]) => creditLinkingApi.suggest(reqs).then(res => res.data),
        onSuccess: (data) => {
            setSuggestions(data);
            // Default select the first suggestion
            const initialLinks: Record<string, any> = {};
            data.forEach((s: any, index: number) => {
                const reqId = requirements[index].id;
                if (s.links && s.links.length > 0) {
                    initialLinks[reqId] = { ...s.links[0] }; // Clone to allow modification
                }
            });
            setSelectedLinks(initialLinks);

        },
        onError: (err: any) => {
            const msg = err.response?.data?.error || 'Có lỗi khi lấy gợi ý';
            showToast(msg, 'error');

        }
    });

    const executeMutation = useMutation({
        mutationFn: (data: any) => creditLinkingApi.execute(data).then(res => res.data),
        onSuccess: (data) => {
            showToast('Liên kết thành công!', 'success');
            setTimeout(() => {
                navigate(`/invoice-mccs/${data.miId}`);
            }, 1000);
        },
        onError: (err: any) => {
            const msg = err.response?.data?.error || 'Có lỗi khi thực hiện liên kết';
            showToast(msg, 'error');
            setIsExecuting(false);
            setShowConfirm(false);
        }
    });

    const handleAddRequirement = () => {
        setRequirements([...requirements, {
            id: Math.random().toString(36).substr(2, 9),
            timezone: 'UTC+8',
            currency: 'USD',
            year: 2025,
            count: 5
        }]);
        setSuggestions(null); // Clear suggestions on add
    };

    const handleRemoveRequirement = (id: string) => {
        setRequirements(requirements.filter(r => r.id !== id));
        setSuggestions(null); // Clear suggestions on remove to prevent index mismatch
    };

    const updateRequirement = (id: string, field: keyof Requirement, value: any) => {
        setRequirements(requirements.map(r => r.id === id ? { ...r, [field]: value } : r));
        setSuggestions(null); // Clear suggestions on update
    };

    const handleGetSuggestions = () => {
        // Validation: MI Info
        if (targetType === 'EXISTING' && !selectedMiId) {
            showToast('Vui lòng điền thông tin MI', 'error');
            return;
        }
        if (targetType === 'NEW' && (!newMiData.name || !newMiData.mccInvoiceId || !newMiData.partnerId)) {
            showToast('Vui lòng điền đầy đủ thông tin MI', 'error');
            return;
        }

        // Validation: Duplicates
        const hasDuplicates = requirements.some((req, index) =>
            requirements.some((r, i) =>
                i < index &&
                r.timezone === req.timezone &&
                r.currency === req.currency &&
                r.year === req.year
            )
        );
        if (hasDuplicates) {
            showToast('Vui lòng loại bỏ các yêu cầu trùng lặp', 'error');
            return;
        }

        const payload = requirements.map(r => ({
            timezone: r.timezone,
            currency: r.currency,
            year: r.year,
            count: r.count
        }));
        suggestMutation.mutate(payload);
    };



    const handleExecuteClick = () => {
        // Validation with Toast
        if (targetType === 'EXISTING' && !selectedMiId) {
            showToast('Vui lòng điền thông tin MI', 'error');
            return;
        }
        if (targetType === 'NEW' && (!newMiData.name || !newMiData.mccInvoiceId || !newMiData.partnerId)) {
            showToast('Vui lòng điền đầy đủ thông tin MI', 'error');
            return;
        }

        const someRequirementsHaveLink = requirements.some(req => selectedLinks[req.id] && selectedLinks[req.id].accountIds?.length > 0);
        if (!someRequirementsHaveLink) {
            showToast('Vui lòng chọn ít nhất một tài khoản để liên kết', 'error');
            return;
        }


        setShowConfirm(true);
    };

    const confirmExecute = () => {
        const links = Object.entries(selectedLinks)
            .filter(([_, link]) => link.accountIds && link.accountIds.length > 0)
            .map(([reqId, link]) => ({
                requirementId: reqId,
                batchId: link.batchId,
                accountIds: link.accountIds
            }));

        setIsExecuting(true);
        executeMutation.mutate({
            links,
            invoiceMccId: targetType === 'EXISTING' ? selectedMiId : undefined,
            newInvoiceMcc: targetType === 'NEW' ? newMiData : undefined
        });
    };

    const handleRemoveAccount = (reqId: string, accountId: string) => {
        const currentLink = selectedLinks[reqId];
        if (!currentLink) return;

        const updatedAccounts = currentLink.accounts.filter((a: Account) => a.id !== accountId);
        const updatedAccountIds = currentLink.accountIds.filter((id: string) => id !== accountId);

        setSelectedLinks({
            ...selectedLinks,
            [reqId]: {
                ...currentLink,
                accounts: updatedAccounts,
                accountIds: updatedAccountIds
            }
        });
    };

    const totalSelectedAccounts = Object.values(selectedLinks).reduce((sum, link) => sum + (link.accountIds?.length || 0), 0);


    const getTargetMIName = () => {
        if (targetType === 'EXISTING') {
            const mi = misData?.find((m: any) => m.id === selectedMiId);
            return mi ? `${mi.name} (${mi.mccInvoiceId})` : 'Chưa chọn';
        } else {
            return newMiData.name || 'MI Mới';
        }
    };

    return (
        <div className="quick-link-tool" style={{ position: 'relative' }}>
            {/* Toast Notification */}
            {toast && (
                <div style={{
                    position: 'fixed',
                    top: 24,
                    right: 24,
                    backgroundColor: toast.type === 'error' ? '#ef4444' : '#10b981',
                    color: 'white',
                    padding: '12px 24px',
                    borderRadius: 8,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    zIndex: 1000,
                    fontSize: 14,
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    animation: 'slideIn 0.3s ease-out'
                }}>
                    {toast.type === 'error' ? <AlertCircle size={18} /> : null}
                    {toast.message}
                </div>
            )}

            <div className="page-header" style={{ marginBottom: 32 }}>
                {/* ... rest of component ... */}

                <h1 className="page-title">
                    <Link size={24} style={{ marginRight: 12, verticalAlign: 'bottom', color: 'var(--primary)' }} />
                    Công cụ Liên kết tín nhanh
                </h1>
            </div>

            <div style={{ maxWidth: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

                {/* Top Section: Destination (Left) and Requirements (Right) */}
                {/* REMOVED alignItems: 'start' to allow stretching for equal height */}
                <div className="quick-link-grid">

                    {/* Destination Section */}
                    <div className="card" style={{ height: '100%' }}>
                        <div className="card-header" style={{ padding: '16px 24px' }}>
                            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Đích đến (MI)</h3>
                        </div>
                        <div className="card-body" style={{ padding: 24 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

                                {/* Toggle Switch */}
                                <div style={{
                                    display: 'flex',
                                    background: 'rgba(0,0,0,0.3)',
                                    padding: 4,
                                    borderRadius: 8,
                                    border: '1px solid var(--border-color)'
                                }}>
                                    <button
                                        className="btn"
                                        style={{
                                            flex: 1,
                                            borderRadius: 6,
                                            height: 36,
                                            fontSize: 14,
                                            backgroundColor: targetType === 'EXISTING' ? 'var(--primary)' : 'transparent',
                                            color: targetType === 'EXISTING' ? 'white' : 'var(--text-secondary)',
                                            fontWeight: targetType === 'EXISTING' ? 600 : 500
                                        }}
                                        onClick={() => setTargetType('EXISTING')}
                                    >
                                        Có sẵn
                                    </button>
                                    <button
                                        className="btn"
                                        style={{
                                            flex: 1,
                                            borderRadius: 6,
                                            height: 36,
                                            fontSize: 14,
                                            backgroundColor: targetType === 'NEW' ? 'var(--primary)' : 'transparent',
                                            color: targetType === 'NEW' ? 'white' : 'var(--text-secondary)',
                                            fontWeight: targetType === 'NEW' ? 600 : 500
                                        }}
                                        onClick={() => setTargetType('NEW')}
                                    >
                                        Tạo mới
                                    </button>
                                </div>

                                <div style={{
                                    backgroundColor: 'var(--surface-hover)',
                                    borderRadius: 8,
                                    border: '1px solid var(--border-color)',
                                    padding: 16
                                }}>
                                    {targetType === 'EXISTING' ? (
                                        <div>
                                            <Label>Invoice MCC</Label>
                                            <Select
                                                value={selectedMiId}
                                                onChange={(e) => setSelectedMiId(e.target.value)}
                                            >
                                                <option value="">-- Chọn MI --</option>
                                                {misData?.map((mi: any) => (
                                                    <option key={mi.id} value={mi.id}>{mi.name} ({mi.mccInvoiceId})</option>
                                                ))}
                                            </Select>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                            <div>
                                                <Label>Tên MI</Label>
                                                <Input
                                                    type="text"
                                                    placeholder="Ví dụ: MI-USA-01"
                                                    value={newMiData.name}
                                                    onChange={(e) => setNewMiData({ ...newMiData, name: e.target.value })}
                                                />
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                                <div>
                                                    <Label>MCC ID</Label>
                                                    <Input
                                                        type="text"
                                                        placeholder="123..."
                                                        value={newMiData.mccInvoiceId}
                                                        onChange={(e) => setNewMiData({ ...newMiData, mccInvoiceId: e.target.value })}
                                                    />
                                                </div>
                                                <div>
                                                    <Label>Đối tác</Label>
                                                    <Select
                                                        value={newMiData.partnerId}
                                                        onChange={(e) => setNewMiData({ ...newMiData, partnerId: e.target.value })}
                                                    >
                                                        <option value="">-- Chọn --</option>
                                                        {partnersData?.map((p: any) => (
                                                            <option key={p.id} value={p.id}>{p.name}</option>
                                                        ))}
                                                    </Select>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <button
                                    className="btn btn-primary"
                                    onClick={handleGetSuggestions}
                                    disabled={suggestMutation.isPending}
                                    style={{ height: 48, width: '100%', marginTop: 8, fontSize: 15, fontWeight: 600 }}
                                >
                                    {suggestMutation.isPending ? 'Đang tải...' : 'Lấy gợi ý tài khoản'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Requirements Section */}
                    <div className="card" style={{ height: '100%' }}>
                        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px' }}>
                            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Nhập yêu cầu tài khoản</h3>
                        </div>
                        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', padding: 24 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                {requirements.map((req, index) => {
                                    const isDuplicate = requirements.some((r, i) =>
                                        i < index &&
                                        r.timezone === req.timezone &&
                                        r.currency === req.currency &&
                                        r.year === req.year
                                    );

                                    return (
                                        <div key={req.id} className="tool-form-row" style={{
                                            alignItems: 'start',
                                            padding: 16,
                                            backgroundColor: 'var(--surface-hover)',
                                            borderRadius: 8,
                                            border: isDuplicate ? '1px solid #ef4444' : '1px solid var(--border-color)',
                                            position: 'relative'
                                        }}>
                                            <div>
                                                <Label>Múi giờ</Label>
                                                <Select
                                                    value={req.timezone}
                                                    onChange={(e) => updateRequirement(req.id, 'timezone', e.target.value)}
                                                >
                                                    <option value="UTC+8">UTC+8</option>
                                                    <option value="UTC-3">UTC-3</option>
                                                    <option value="UTC+7">UTC+7</option>
                                                    <option value="UTC+0">UTC+0</option>
                                                </Select>
                                            </div>
                                            <div>
                                                <Label>Loại tiền</Label>
                                                <Select
                                                    value={req.currency}
                                                    onChange={(e) => updateRequirement(req.id, 'currency', e.target.value)}
                                                >
                                                    <option value="USD">USD</option>
                                                    <option value="PHP">PHP</option>
                                                    <option value="VND">VND</option>
                                                </Select>
                                            </div>
                                            <div>
                                                <Label>Năm</Label>
                                                <Input
                                                    type="number"
                                                    value={req.year || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        updateRequirement(req.id, 'year', val === '' ? 0 : parseInt(val));
                                                    }}
                                                />
                                            </div>
                                            <div>
                                                <Label>Số lượng</Label>
                                                <Input
                                                    type="number"
                                                    value={req.count || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        updateRequirement(req.id, 'count', val === '' ? 0 : parseInt(val));
                                                    }}
                                                />
                                            </div>
                                            <div>
                                                <Label style={{ visibility: 'hidden' }}>Xóa</Label>
                                                {requirements.length > 1 && (
                                                    <button
                                                        className="btn"
                                                        style={{
                                                            height: 42,
                                                            width: 42,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            backgroundColor: 'rgba(0, 0, 0, 0.5)',
                                                            border: '1px solid var(--border-color)',
                                                            borderRadius: 8,
                                                            color: '#ef4444',
                                                            cursor: 'pointer',
                                                            padding: 0
                                                        }}
                                                        onClick={() => handleRemoveRequirement(req.id)}
                                                        title="Xóa dòng"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                )}
                                            </div>

                                            {isDuplicate && (
                                                <div style={{
                                                    gridColumn: '1 / -1',
                                                    color: '#ef4444',
                                                    fontSize: 13,
                                                    marginTop: -8,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 6,
                                                    paddingLeft: 4
                                                }}>
                                                    <AlertCircle size={14} />
                                                    Loại tài khoản này đang bị trùng
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            <div style={{ marginTop: 24 }}>
                                <button className="btn btn-secondary btn-sm" onClick={handleAddRequirement} style={{ width: '100%', height: 40, borderStyle: 'dashed', borderColor: 'var(--border-muted)' }}>
                                    <Plus size={16} style={{ marginRight: 6 }} /> Thêm yêu cầu
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Suggestions Section */}
                {suggestions && (
                    <div className="card" style={{ marginTop: 24 }}>
                        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px' }}>
                            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Kết quả gợi ý</h3>
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => setSuggestions(null)}
                            >
                                <ArrowRight size={16} style={{ transform: 'rotate(180deg)', marginRight: 4 }} /> Quay lại
                            </button>
                        </div>
                        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: 24 }}>
                            {suggestions.map((s, index) => {
                                const reqId = requirements[index].id;
                                const selected = selectedLinks[reqId];

                                return (
                                    <div key={reqId} style={{
                                        border: '1px solid var(--border-color)',
                                        borderRadius: 8,
                                        padding: 20,
                                        backgroundColor: 'var(--surface)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20, alignItems: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <div style={{
                                                    width: 32, height: 32,
                                                    borderRadius: '50%',
                                                    backgroundColor: 'var(--primary-bg)',
                                                    color: 'var(--primary)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontWeight: 600
                                                }}>
                                                    {index + 1}
                                                </div>
                                                <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>
                                                    {s.requirement.count} TK • {s.requirement.timezone} • {s.requirement.currency} • Năm {s.requirement.year}
                                                </div>
                                            </div>

                                            <div style={{ minWidth: 400 }}>
                                                {s.links.length > 0 ? (
                                                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                                        <span style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Nguồn từ Lô:</span>
                                                        <Select
                                                            value={selected?.batchId}
                                                            style={{ height: 38, fontSize: 13 }}
                                                            onChange={(e) => {
                                                                const newBatchId = e.target.value;
                                                                const found = s.links.find((l: any) => l.batchId === newBatchId);
                                                                if (found) {
                                                                    setSelectedLinks({ ...selectedLinks, [reqId]: { ...found } });
                                                                }
                                                            }}
                                                        >
                                                            {s.links.map((link: any) => (
                                                                <option key={link.batchId} value={link.batchId}>
                                                                    {link.batchName} (Readiness: {link.readiness} | {link.accountsCount} TK)
                                                                </option>
                                                            ))}
                                                        </Select>
                                                    </div>
                                                ) : (
                                                    null
                                                )}
                                            </div>
                                        </div>

                                        {selected && selected.accounts && selected.accounts.length > 0 ? (
                                            /* Styles matched to Batches.tsx table style */
                                            <div className="table-container" style={{ border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden' }}>
                                                <table className="data-table" style={{ width: '100%' }}>
                                                    <thead>
                                                        <tr>
                                                            <th style={{ width: '25%' }}>Tên tài khoản / ID</th>
                                                            <th style={{ width: '10%' }}>Múi giờ</th>
                                                            <th style={{ width: '10%' }}>Loại tiền</th>
                                                            <th style={{ width: '10%' }}>Năm</th>
                                                            <th style={{ width: '15%' }}>Lô (MA)</th>
                                                            <th style={{ width: '10%' }}>Readiness</th>
                                                            <th style={{ width: '5%' }}></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {selected.accounts.map((acc: Account) => (
                                                            <tr key={acc.id}>
                                                                <td>
                                                                    <div style={{ fontWeight: 600 }}>{acc.accountName || acc.name}</div>
                                                                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{acc.googleAccountId}</div>
                                                                </td>
                                                                <td>{acc.timezone}</td>
                                                                <td>{acc.currency}</td>
                                                                <td>2025</td> {/* Placeholder */}
                                                                <td>{acc.batchName}</td>
                                                                <td>
                                                                    <div style={{
                                                                        width: 24, height: 24,
                                                                        borderRadius: '50%',
                                                                        background: `rgba(${acc.readiness >= 8 ? '16, 185, 129' : acc.readiness >= 5 ? '245, 158, 11' : '239, 68, 68'}, 0.2)`,
                                                                        color: acc.readiness >= 8 ? '#10b981' : acc.readiness >= 5 ? '#f59e0b' : '#ef4444',
                                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 12
                                                                    }}>
                                                                        {acc.readiness}
                                                                    </div>
                                                                </td>
                                                                <td>
                                                                    <button
                                                                        className="btn"
                                                                        style={{
                                                                            height: 32,
                                                                            width: 32,
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            backgroundColor: 'rgba(0, 0, 0, 0.5)',
                                                                            border: '1px solid var(--border-color)',
                                                                            borderRadius: 6,
                                                                            color: 'var(--text-muted)',
                                                                            cursor: 'pointer',
                                                                            padding: 0
                                                                        }}
                                                                        onClick={() => handleRemoveAccount(reqId, acc.id)}
                                                                        title="Bỏ chọn"
                                                                    >
                                                                        <X size={16} />
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                                <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-muted)', textAlign: 'right', fontSize: 13, background: 'var(--surface)' }}>
                                                    Đã chọn: <strong style={{ color: 'var(--primary)' }}>{selected?.accounts?.length || 0}</strong> tài khoản
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{
                                                padding: 40,
                                                textAlign: 'center',
                                                border: '2px dashed var(--border-muted)',
                                                borderRadius: 8,
                                                backgroundColor: 'var(--surface-hover)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                gap: 12
                                            }}>
                                                <AlertCircle size={24} style={{ color: 'var(--text-muted)', opacity: 0.7 }} />
                                                <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                                                    {s.links.length === 0
                                                        ? 'Không tìm thấy lô nào đáp ứng đủ yêu cầu này.'
                                                        : 'Bạn đã bỏ chọn tất cả tài khoản.'}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}



                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleExecuteClick}
                                    disabled={isExecuting}
                                    style={{ height: 48, padding: '0 32px', fontSize: 15, fontWeight: 600, borderRadius: 8 }}
                                >
                                    {isExecuting ? 'Đang thực hiện...' : `Liên kết ${totalSelectedAccounts} tài khoản`}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <ConfirmModal
                isOpen={showConfirm}
                onClose={() => setShowConfirm(false)}
                onConfirm={confirmExecute}
                title="Xác nhận liên kết"
                type="info"
                confirmText={isExecuting ? "Đang xử lý..." : "Xác nhận"}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <p>Bạn đang thực hiện liên kết vào MI: <strong>{getTargetMIName()}</strong></p>

                    <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 8, padding: 12 }}>
                        <table style={{ width: '100%', fontSize: 13 }}>
                            <thead>
                                <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                                    <th style={{ paddingBottom: 8 }}>Lô (MA)</th>
                                    <th style={{ paddingBottom: 8, textAlign: 'right' }}>Số lượng</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Object.values(selectedLinks).map((link: any, idx) => (
                                    link.accountIds.length > 0 && (
                                        <tr key={idx} style={{ borderTop: idx > 0 ? '1px solid var(--border-color)' : 'none' }}>
                                            <td style={{ padding: '8px 0' }}>{link.batchName}</td>
                                            <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 600 }}>{link.accountIds.length}</td>
                                        </tr>
                                    )
                                ))}
                                <tr style={{ borderTop: '2px solid var(--border-color)' }}>
                                    <td style={{ padding: '12px 0', fontWeight: 600 }}>Tổng cộng</td>
                                    <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 600, color: 'var(--primary)' }}>
                                        {totalSelectedAccounts} tài khoản
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </ConfirmModal>
        </div>
    );
}
