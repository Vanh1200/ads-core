import { useState, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, FileSpreadsheet, CheckCircle, AlertTriangle, AlertCircle, Calendar, Info, X } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';
import { useAuthStore } from '../store/authStore';
import { importApi } from '../api/client';

interface PreviewItem {
    googleAccountId: string;
    accountName: string;
    status: string;
    newStatus: string;
    newAmount: number;
    existingAmount: number | null;
    hasConflict: boolean;
    hasExisting: boolean;
    isNewAccount: boolean;
    accountId: string | null;
    miName: string | null;
    mcName: string | null;
}

interface PreviewResult {
    spendingDate: string;
    batchName: string;
    batchId: string | null;
    miId: string | null;
    miName: string | null;
    dateRange: string;
    totalItems: number;
    conflictCount: number;
    existingCount: number;
    hasConflicts: boolean;
    hasExisting: boolean;
    newAccounts: number;
    existingAccounts: number;
    data: PreviewItem[];
}

// Keep state when navigating away
let savedState: {
    file: File | null;
    spendingDate: string;
    previewData: PreviewResult | null;
    importMode: 'MA' | 'MI';
} | null = null;

export default function Import() {
    const [file, setFile] = useState<File | null>(savedState?.file || null);
    const [result, setResult] = useState<{
        success: boolean;
        message: string;
        results?: Record<string, number>;
    } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const queryClient = useQueryClient();
    const { user } = useAuthStore();

    // Spending import states
    const [spendingDate, setSpendingDate] = useState(() => {
        if (savedState?.spendingDate) return savedState.spendingDate;
        const today = new Date();
        return today.toISOString().split('T')[0];
    });
    const [importMode, setImportMode] = useState<'MA' | 'MI'>(savedState?.importMode || 'MA');
    const [previewData, setPreviewData] = useState<PreviewResult | null>(savedState?.previewData || null);
    const [showConfirmModal, setShowConfirmModal] = useState(false);

    // Access control: Only ADMIN, BUYER, UPDATER
    if (user && !['ADMIN', 'MANAGER', 'BUYER', 'UPDATER'].includes(user.role)) {
        return (
            <div style={{ padding: 40, textAlign: 'center' }}>
                <AlertTriangle size={48} style={{ color: 'var(--warning)', margin: '0 auto 16px' }} />
                <h2>Truy cập bị từ chối</h2>
                <p style={{ color: 'var(--text-muted)' }}>Bạn không có quyền truy cập vào trang này.</p>
            </div>
        );
    }

    // Save state when unmounting
    useEffect(() => {
        return () => {
            savedState = { file, spendingDate, previewData, importMode };
        };
    }, [file, spendingDate, previewData, importMode]);

    const previewSpendingMutation = useMutation({
        mutationFn: (file: File) => importApi.previewSpending(file, spendingDate),
        onSuccess: (response) => {
            setPreviewData(response.data);
        },
        onError: (error: unknown) => {
            const err = error as { response?: { data?: { error?: string } } };
            setResult({
                success: false,
                message: err.response?.data?.error || 'Preview thất bại',
            });
            setPreviewData(null);
        },
    });

    const confirmSpendingMutation = useMutation({
        mutationFn: ({ overwrite }: { overwrite: boolean }) =>
            importApi.confirmSpending(
                previewData!.spendingDate,
                previewData!.batchId,
                previewData!.data,
                overwrite,
                previewData!.miId || undefined
            ),
        onSuccess: (response) => {
            setResult({
                success: true,
                message: response.data.message,
                results: response.data.results,
            });
            setShowConfirmModal(false);
            setPreviewData(null);
            setFile(null);
            savedState = null;
            queryClient.invalidateQueries({ queryKey: ['spending'] });
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
            queryClient.invalidateQueries({ queryKey: ['batches'] });
        },
        onError: (error: unknown) => {
            const err = error as { response?: { data?: { error?: string } } };
            setResult({
                success: false,
                message: err.response?.data?.error || 'Import thất bại',
            });
        },
    });

    // Calculate dates for UI
    const todayStr = new Date().toISOString().split('T')[0];
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // Auto-preview when file is selected or date changes
    useEffect(() => {
        if (file && spendingDate && !previewData) {
            previewSpendingMutation.mutate(file);
        }
    }, [file, spendingDate, previewData, previewSpendingMutation]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            setResult(null);
            setPreviewData(null);
        }
    };

    const handleClearFile = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setFile(null);
        setPreviewData(null);
        setResult(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleConfirmImport = (overwrite: boolean) => {
        confirmSpendingMutation.mutate({ overwrite });
    };

    const setQuickDate = (days: number) => {
        const date = new Date();
        date.setDate(date.getDate() - days);
        const dateStr = date.toISOString().split('T')[0];
        setSpendingDate(dateStr);
        if (file) setPreviewData(null);
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('vi-VN', {
            weekday: 'long',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('vi-VN', {
            style: 'decimal',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount);
    };

    const getStatusBadge = (status: string) => {
        const statusMap: Record<string, { class: string; label: string }> = {
            'ACTIVE': { class: 'badge-success', label: 'Hoạt động' },
            'SUSPENDED': { class: 'badge-secondary', label: 'Không hoạt động' },
            'NEW': { class: 'badge-info', label: 'Mới' },
        };
        const s = statusMap[status] || { class: 'badge-secondary', label: status };
        return <span className={`badge ${s.class}`}>{s.label}</span>;
    };

    const isLoading = previewSpendingMutation.isPending || confirmSpendingMutation.isPending;

    // Count existing records (same date, any amount)
    const existingRecordsCount = previewData?.data.filter(d => d.existingAmount !== null).length || 0;

    return (
        <div style={{ width: '100%' }}>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Import Chi phí</h1>
                    <p className="page-subtitle">Import chi phí từ file Excel (cùng format với thêm lô mới)</p>
                </div>
            </div>

            {/* Two-column layout: Upload form + Help */}
            <div className="import-grid">
                {/* Left: Upload Form */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <div className="card-body">
                        <div className="form-group">
                            <label className="form-label">Chế độ Import</label>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                                <button
                                    type="button"
                                    className={`btn btn-sm ${importMode === 'MA' ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => { setImportMode('MA'); setPreviewData(null); }}
                                >
                                    Theo Lô (MA)
                                </button>
                                <button
                                    type="button"
                                    className={`btn btn-sm ${importMode === 'MI' ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => { setImportMode('MI'); setPreviewData(null); }}
                                >
                                    Theo Invoice (MI)
                                </button>
                            </div>
                        </div>


                        {/* Date Selection */}
                        <div className="form-group">
                            <label className="form-label">
                                <Calendar size={16} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
                                Ngày chi phí *
                            </label>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                                <button
                                    type="button"
                                    className={`btn btn-sm ${spendingDate === todayStr ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => setQuickDate(0)}
                                >
                                    Hôm nay
                                </button>
                                <button
                                    type="button"
                                    className={`btn btn-sm ${spendingDate === yesterdayStr ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => setQuickDate(1)}
                                >
                                    Hôm qua
                                </button>
                            </div>
                            <input
                                type="date"
                                className="form-input"
                                value={spendingDate}
                                onChange={(e) => {
                                    setSpendingDate(e.target.value);
                                    if (file) setPreviewData(null);
                                }}
                            />
                            <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
                                {formatDate(spendingDate)}
                            </div>
                        </div>

                        <input
                            type="file"
                            ref={fileInputRef}
                            accept=".xlsx,.xls"
                            onChange={handleFileSelect}
                            style={{ display: 'none' }}
                        />

                        <div
                            className={`file-upload ${file ? 'has-file' : ''}`}
                            onClick={() => !file && fileInputRef.current?.click()}
                            style={{ position: 'relative' }}
                        >
                            {file ? (
                                <>
                                    <button
                                        type="button"
                                        className="btn-clear-file"
                                        onClick={(e) => handleClearFile(e)}
                                        title="Xóa file"
                                        style={{
                                            position: 'absolute',
                                            top: '12px',
                                            right: '12px',
                                            padding: '4px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            background: 'var(--bg-secondary)',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '50%',
                                            cursor: 'pointer',
                                            color: 'var(--text-muted)',
                                            zIndex: 2,
                                        }}
                                        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--danger)')}
                                        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                                    >
                                        <X size={18} />
                                    </button>
                                    <div style={{ cursor: 'pointer' }} onClick={() => fileInputRef.current?.click()}>
                                        <FileSpreadsheet size={48} style={{ color: 'var(--secondary)' }} />
                                        <p className="file-upload-text">{file.name}</p>
                                        <p className="file-upload-hint">{(file.size / 1024).toFixed(1)} KB - Click để đổi file</p>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <Upload size={48} />
                                    <p className="file-upload-text">
                                        Click để chọn file Excel
                                    </p>
                                    <p className="file-upload-hint">
                                        Hỗ trợ định dạng .xlsx, .xls (tối đa 10MB)
                                    </p>
                                </>
                            )}
                        </div>

                        {isLoading && (
                            <div style={{ textAlign: 'center', padding: '20px' }}>
                                <div className="spinner" style={{ margin: '0 auto 12px' }}></div>
                                <p style={{ color: 'var(--text-muted)' }}>Đang xử lý...</p>
                            </div>
                        )}

                        {result && (
                            <div
                                style={{
                                    marginTop: '20px',
                                    padding: '16px',
                                    borderRadius: 'var(--radius-sm)',
                                    background: result.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                    border: `1px solid ${result.success ? 'var(--secondary)' : 'var(--danger)'}`,
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                    {result.success ? (
                                        <CheckCircle size={24} style={{ color: 'var(--secondary)' }} />
                                    ) : (
                                        <AlertCircle size={24} style={{ color: 'var(--danger)' }} />
                                    )}
                                    <strong style={{ color: result.success ? 'var(--secondary)' : 'var(--danger)' }}>
                                        {result.success ? 'Import thành công!' : 'Import thất bại'}
                                    </strong>
                                </div>
                                <p style={{ color: 'var(--text-muted)' }}>{result.message}</p>
                                {result.results && (
                                    <div style={{ marginTop: '12px', fontSize: '14px' }}>
                                        {result.results.accountsCreated !== undefined && <p>✓ TK tạo mới: {result.results.accountsCreated}</p>}
                                        {result.results.accountsUpdated !== undefined && <p>✓ TK cập nhật: {result.results.accountsUpdated}</p>}
                                        {result.results.spendingCreated !== undefined && <p>✓ Chi phí mới: {result.results.spendingCreated}</p>}
                                        {result.results.spendingUpdated !== undefined && <p>✓ Chi phí cập nhật: {result.results.spendingUpdated}</p>}
                                        {result.results.skipped !== undefined && result.results.skipped > 0 && <p>○ Bỏ qua: {result.results.skipped}</p>}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Help Section */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <div className="card-header">
                        <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Info size={18} />
                            Hướng dẫn format file Excel
                        </h3>
                    </div>
                    <div className="card-body" style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                        <p><strong>Dựa trên tiêu đề (không quan trọng thứ tự cột):</strong></p>
                        <ul style={{ marginTop: '8px', paddingLeft: '20px', lineHeight: '1.8' }}>
                            <li><strong>Tình trạng Tài khoản</strong>: Đang hoạt động, Không hoạt động</li>
                            <li><strong>Tên tài khoản</strong>: Tên tài khoản Google Ads</li>
                            <li><strong>ID khách hàng bên ngoài</strong>: ID xxx-xxx-xxxx</li>
                            <li><strong>Tên người quản lý</strong>: Tên MCC Account</li>
                            <li><strong>Mã KH của người quản lý</strong>: ID MCC Account</li>
                            <li><strong>Mã đơn vị tiền tệ</strong>: USD, VND, EUR...</li>
                            <li><strong style={{ color: 'var(--secondary)' }}>Chi phí</strong>: Số tiền chi tiêu trong ngày</li>
                        </ul>
                        <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: 'var(--radius-sm)' }}>
                            <strong style={{ color: 'var(--primary)' }}>Lưu ý:</strong>
                            <ul style={{ marginTop: '6px', paddingLeft: '16px', fontSize: '13px' }}>
                                <li>Hệ thống tự động tìm tiêu đề phù hợp</li>
                                <li>Tự động nhận diện MI theo ID có trong file</li>
                                <li>Nếu đã có chi phí cho ngày đó sẽ hiện cảnh báo ghi đè</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            {/* Preview Section */}
            {previewData && !isLoading && (
                <div className="card" style={{ marginTop: '24px' }}>
                    <div className="card-header">
                        <h3 className="card-title">Preview Import</h3>
                    </div>
                    <div className="card-body">
                        {/* Summary */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(4, 1fr)',
                            gap: '16px',
                            marginBottom: '20px',
                            padding: '16px',
                            background: 'var(--bg-secondary)',
                            borderRadius: 'var(--radius-sm)',
                        }}>
                            <div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                    {importMode === 'MI' ? 'Invoice MI' : 'Lô tài khoản (MA)'}
                                </div>
                                <div style={{ fontWeight: 600 }}>
                                    {importMode === 'MI'
                                        ? (previewData.miName || previewData.batchName || 'N/A')
                                        : (previewData.batchName || 'N/A')
                                    }
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Ngày chi phí</div>
                                <div style={{ fontWeight: 600 }}>{formatDate(previewData.spendingDate)}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Tổng tài khoản</div>
                                <div style={{ fontWeight: 600 }}>{previewData.totalItems}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Đã có dữ liệu</div>
                                <div style={{ fontWeight: 600, color: existingRecordsCount > 0 ? 'var(--warning)' : 'var(--secondary)' }}>
                                    {existingRecordsCount}
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
                            <div style={{ padding: '12px 16px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: 'var(--radius-sm)', flex: 1, textAlign: 'center' }}>
                                <div style={{ fontSize: '24px', fontWeight: 600, color: 'var(--secondary)' }}>{previewData.existingAccounts}</div>
                                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>TK đã có</div>
                            </div>
                            <div style={{ padding: '12px 16px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: 'var(--radius-sm)', flex: 1, textAlign: 'center' }}>
                                <div style={{ fontSize: '24px', fontWeight: 600, color: 'var(--primary)' }}>{previewData.newAccounts}</div>
                                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>TK mới</div>
                            </div>
                        </div>

                        {existingRecordsCount > 0 && (
                            <div style={{
                                padding: '12px 16px',
                                background: 'rgba(245, 158, 11, 0.1)',
                                border: '1px solid var(--warning)',
                                borderRadius: 'var(--radius-sm)',
                                marginBottom: '20px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                            }}>
                                <AlertTriangle size={20} style={{ color: 'var(--warning)', flexShrink: 0 }} />
                                <div>
                                    <strong style={{ color: 'var(--warning)' }}>Có {existingRecordsCount} bản ghi đã tồn tại cho ngày {formatDate(previewData.spendingDate)}</strong>
                                    <p style={{ fontSize: '13px', margin: '4px 0 0', color: 'var(--text-muted)' }}>
                                        Import sẽ ghi đè dữ liệu cũ. Dữ liệu cũ được hiển thị ở cột "Chi phí cũ".
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Preview Table */}
                        <div className="table-container">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '25%' }}>Tài khoản</th>
                                        <th style={{ width: '18%' }}>Trạng thái</th>
                                        <th style={{ width: '14%', textAlign: 'right' }}>Chi phí mới</th>
                                        <th style={{ width: '14%', textAlign: 'right' }}>Chi phí cũ</th>
                                        <th style={{ width: '29%' }}>Ghi chú</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {previewData.data.slice(0, 50).map((item, idx) => (
                                        <tr key={item.googleAccountId + idx}>
                                            <td>
                                                <div style={{ fontWeight: 500, fontFamily: 'monospace' }}>{item.googleAccountId}</div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.accountName}</div>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                    {getStatusBadge(item.status)}
                                                    {item.status !== item.newStatus && (
                                                        <>
                                                            <span style={{ color: 'var(--text-muted)' }}>→</span>
                                                            {getStatusBadge(item.newStatus)}
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                            <td style={{ textAlign: 'right', fontWeight: 500, color: 'var(--secondary)' }}>
                                                ${formatCurrency(item.newAmount)}
                                            </td>
                                            <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>
                                                {item.existingAmount !== null ? `$${formatCurrency(item.existingAmount)}` : '-'}
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                    {item.isNewAccount && <span className="badge badge-info">TK mới</span>}
                                                    {item.existingAmount !== null && item.existingAmount !== item.newAmount && (
                                                        <span className="badge badge-warning">Ghi đè (khác)</span>
                                                    )}
                                                    {item.existingAmount !== null && item.existingAmount === item.newAmount && (
                                                        <span className="badge badge-secondary">Không đổi</span>
                                                    )}
                                                    {item.status !== item.newStatus && !item.isNewAccount && <span className="badge badge-info">Đổi TT</span>}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {previewData.data.length > 50 && (
                                <p style={{ textAlign: 'center', padding: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
                                    Hiển thị 50/{previewData.data.length} tài khoản...
                                </p>
                            )}
                        </div>

                        {/* Action Buttons */}
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                            <button className="btn btn-secondary" onClick={() => { setPreviewData(null); setFile(null); savedState = null; }}>
                                Hủy
                            </button>
                            {existingRecordsCount > 0 ? (
                                <button
                                    className="btn btn-primary"
                                    onClick={() => setShowConfirmModal(true)}
                                    disabled={confirmSpendingMutation.isPending}
                                >
                                    Import & Ghi đè ({previewData.totalItems})
                                </button>
                            ) : (
                                <button
                                    className="btn btn-primary"
                                    onClick={() => handleConfirmImport(false)}
                                    disabled={confirmSpendingMutation.isPending}
                                >
                                    {confirmSpendingMutation.isPending ? 'Đang import...' : `Import (${previewData.totalItems})`}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Confirm Overwrite Modal */}
            <ConfirmModal
                isOpen={showConfirmModal}
                onClose={() => setShowConfirmModal(false)}
                onConfirm={() => handleConfirmImport(true)}
                title="Xác nhận ghi đè?"
                confirmText={confirmSpendingMutation.isPending ? 'Đang import...' : 'Xác nhận ghi đè'}
                cancelText="Hủy"
                type="danger"
                isLoading={confirmSpendingMutation.isPending}
            >
                <div style={{ padding: '0 4px' }}>
                    <p style={{ marginBottom: '16px', fontSize: '15px' }}>
                        Có <strong>{existingRecordsCount}</strong> bản ghi đã tồn tại cho ngày <strong>{formatDate(previewData?.spendingDate || '')}</strong>.
                    </p>
                    <p style={{ marginBottom: '8px', color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.5' }}>
                        Import sẽ ghi đè toàn bộ dữ liệu chi phí cũ bằng giá trị mới từ file Excel.
                    </p>
                    <p style={{ color: 'var(--danger)', fontSize: '14px', fontStyle: 'italic' }}>
                        Lưu ý: Hành động này không thể hoàn tác.
                    </p>
                </div>
            </ConfirmModal>
        </div>
    );
}
