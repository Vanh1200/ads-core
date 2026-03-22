import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Filter, Edit2, Trash2, ChevronUp, ChevronDown, Copy, Upload, FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react';
import Dropdown from '../components/Dropdown';
import SearchDropdown from '../components/SearchDropdown';
import { invoiceMCCsApi, partnersApi, importApi } from '../api/client';
import { useAuthStore, canLinkMI } from '../store/authStore';
import { useRef } from 'react';

interface InvoiceMCC {
    id: string;
    name: string;
    mccInvoiceId: string;
    status: string;
    creditStatus: string;
    linkedAccountsCount: number;
    activeAccountsCount: number;
    partner: { id: string; name: string } | null;
    partnerId?: string | null;
    notes?: string | null;
    rangeSpending?: number;
    _count?: { accounts: number };
}

interface Partner {
    id: string;
    name: string;
}

type SortField = 'name' | 'mccInvoiceId' | 'status' | 'creditStatus' | 'rangeSpending' | 'createdAt' | 'updatedAt';
type SortOrder = 'asc' | 'desc';

export default function InvoiceMCCs() {
    const { user } = useAuthStore();
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [spendingDays, setSpendingDays] = useState(7);
    const [showModal, setShowModal] = useState(false);
    const [selectedInvoiceMCC, setSelectedInvoiceMCC] = useState<InvoiceMCC | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // Sorting
    const [sortField, setSortField] = useState<SortField>('updatedAt');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

    const [isSearchOpen, setIsSearchOpen] = useState(false);

    // Selection State
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null);
    const [showBulkEditStatus, setShowBulkEditStatus] = useState(false);
    const [bulkStatus, setBulkStatus] = useState('');
    const [bulkCreditStatus, setBulkCreditStatus] = useState('');
    const [bulkPartnerId, setBulkPartnerId] = useState('');
    const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

    // Import State
    const [showImportModal, setShowImportModal] = useState(false);
    const [modalStep, setModalStep] = useState<'upload' | 'preview'>('upload');
    const [file, setFile] = useState<File | null>(null);
    const [parsedData, setParsedData] = useState<any>(null);
    const [editedMccInvoiceId, setEditedMccInvoiceId] = useState('');
    const [editedMiName, setEditedMiName] = useState('');
    const [editedPartnerId, setEditedPartnerId] = useState('');
    const [parseError, setParseError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const queryClient = useQueryClient();

    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    // Reset global selection when filters change
    useEffect(() => {
        setSelectedIds(new Set());
    }, [search, spendingDays]);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
    };

    const { data, isLoading } = useQuery({
        queryKey: ['invoiceMCCs', search, spendingDays, page, limit, sortField, sortOrder],
        queryFn: () => invoiceMCCsApi.list({
            search,
            spendingDays,
            page,
            limit,
            sortBy: sortField,
            sortOrder
        }),
    });

    const { data: partnersData } = useQuery({
        queryKey: ['partnersList'],
        queryFn: () => partnersApi.list({ limit: 100 }), // Fetch enough partners
    });

    const invoiceMCCs = data?.data?.data || [];
    const pagination = data?.data?.pagination || { total: 0, pages: 0 };
    const partners = partnersData?.data?.data || [];

    // Bulk Management
    const allSelected = (invoiceMCCs.length > 0 && invoiceMCCs.every((i: InvoiceMCC) => selectedIds.has(i.id)));
    const someSelected = (invoiceMCCs.length > 0 && invoiceMCCs.some((i: InvoiceMCC) => selectedIds.has(i.id)));

    const toggleSelectAll = () => {
        if (allSelected) {
            const newSet = new Set(selectedIds);
            invoiceMCCs.forEach((i: InvoiceMCC) => newSet.delete(i.id));
            setSelectedIds(newSet);
        } else {
            const newSet = new Set(selectedIds);
            invoiceMCCs.forEach((i: InvoiceMCC) => newSet.add(i.id));
            setSelectedIds(newSet);
        }
    };

    const toggleSelect = (id: string, index: number, event?: any) => {
        const isShift = event?.shiftKey || (event?.nativeEvent && (event.nativeEvent as any).shiftKey);

        setSelectedIds(prev => {
            const next = new Set(prev);
            if (isShift && selectionAnchor !== null && selectionAnchor !== index) {
                const start = Math.min(selectionAnchor, index);
                const end = Math.max(selectionAnchor, index);
                const shouldSelect = !prev.has(id);

                for (let i = start; i <= end; i++) {
                    const miId = invoiceMCCs[i]?.id;
                    if (miId) {
                        if (shouldSelect) next.add(miId);
                        else next.delete(miId);
                    }
                }
            } else {
                if (next.has(id)) next.delete(id);
                else next.add(id);
                setSelectionAnchor(index);
            }
            return next;
        });
    };

    const bulkUpdateStatusMutation = useMutation({
        mutationFn: ({ ids, status, creditStatus, partnerId }: { ids: string[]; status?: string; creditStatus?: string; partnerId?: string }) =>
            Promise.all(ids.map(id => {
                const updateData: any = {};
                if (status) updateData.status = status;
                if (creditStatus) updateData.creditStatus = creditStatus;
                if (partnerId !== undefined) updateData.partnerId = partnerId || null;
                return invoiceMCCsApi.update(id, updateData);
            })),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['invoiceMCCs'] });
            showToast(`Đã cập nhật thông tin cho ${selectedIds.size} Invoice MCC thành công!`, 'success');
            setSelectedIds(new Set());
            setShowBulkEditStatus(false);
            setBulkStatus('');
            setBulkCreditStatus('');
            setBulkPartnerId('');
        },
        onError: () => showToast('Có lỗi xảy ra khi cập nhật!', 'error')
    });

    const bulkDeleteMutation = useMutation({
        mutationFn: (ids: string[]) =>
            Promise.all(ids.map(id => invoiceMCCsApi.delete(id))),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['invoiceMCCs'] });
            showToast(`Đã xóa ${selectedIds.size} Invoice MCC thành công!`, 'success');
            setSelectedIds(new Set());
            setConfirmBulkDelete(false);
        },
        onError: () => showToast('Có lỗi xảy ra hoặc Invoice MCC đang có tài khoản liên kết!', 'error')
    });

    const createMutation = useMutation({
        mutationFn: (data: object) => invoiceMCCsApi.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['invoiceMCCs'] });
            setShowModal(false);
            showToast('Tạo Invoice MCC thành công', 'success');
        },
        onError: (error: any) => {
            const errData = error.response?.data?.error;
            let message = 'Có lỗi xảy ra';
            if (typeof errData === 'string') {
                message = errData;
            } else if (Array.isArray(errData)) {
                message = errData.map((e: any) => e.message).join(', ');
            }
            showToast(message, 'error');
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: object }) => invoiceMCCsApi.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['invoiceMCCs'] });
            setShowModal(false);
            setSelectedInvoiceMCC(null);
            showToast('Cập nhật Invoice MCC thành công', 'success');
        },
        onError: (error: any) => {
            const errData = error.response?.data?.error;
            let message = 'Có lỗi xảy ra';
            if (typeof errData === 'string') {
                message = errData;
            } else if (Array.isArray(errData)) {
                message = errData.map((e: any) => e.message).join(', ');
            }
            showToast(message, 'error');
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => invoiceMCCsApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['invoiceMCCs'] });
            setDeleteId(null);
            showToast('Xóa Invoice MCC thành công', 'success');
        },
        onError: (error: any) => {
            setDeleteId(null);
            const errData = error.response?.data?.error;
            let message = 'Không thể xóa Invoice MCC này';
            if (typeof errData === 'string') {
                message = errData;
            } else if (Array.isArray(errData)) {
                message = errData.map((e: any) => e.message).join(', ');
            }
            showToast(message, 'error');
        },
    });

    const parseMutation = useMutation({
        mutationFn: (file: File) => importApi.parseMI(file),
        onSuccess: (response) => {
            const data = response.data;
            setParsedData(data);
            setEditedMccInvoiceId(data.mccInvoiceId || '');
            setEditedMiName(data.miName || '');
            
            if (data.existingMiDetails) {
                 setEditedPartnerId(data.existingMiDetails.partnerId || '');
            } else {
                 setEditedPartnerId('');
            }
            
            setModalStep('preview');
            setParseError(null);
        },
        onError: (error: any) => {
            setParseError(error.response?.data?.error || 'Không thể đọc file Excel');
        },
    });

    const createImportMutation = useMutation({
        mutationFn: (data: any) => importApi.createMIWithAccounts(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['invoiceMCCs'] });
            closeImportModal();
            showToast(parsedData?.existingMi ? 'Cập nhật Invoice MCC thành công' : 'Tạo Invoice MCC từ file thành công', 'success');
        },
        onError: (error: any) => {
            showToast(error.response?.data?.error || 'Có lỗi xảy ra', 'error');
        },
    });

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            setParseError(null);
            parseMutation.mutate(selectedFile);
        }
    };

    const handleImportCreate = () => {
        if (!parsedData) return;
        createImportMutation.mutate({
            mccInvoiceId: editedMccInvoiceId,
            name: editedMiName,
            partnerId: editedPartnerId || null,
            accounts: parsedData.accounts,
        });
    };

    const closeImportModal = () => {
        setShowImportModal(false);
        setModalStep('upload');
        setFile(null);
        setParsedData(null);
        setParseError(null);
        setEditedMccInvoiceId('');
        setEditedMiName('');
        setEditedPartnerId('');
    };

    const statusLabels: Record<string, { label: string; class: string }> = {
        ACTIVE: { label: 'Hoạt động', class: 'success' },
        PENDING: { label: 'Chờ kết nối', class: 'warning' },
        EXHAUSTED: { label: 'Hết tín dụng', class: 'danger' },
        INACTIVE: { label: 'Không hoạt động', class: 'danger' },
    };

    const creditStatusLabels: Record<string, { label: string; class: string }> = {
        PENDING: { label: 'Chờ kết nối', class: 'warning' },
        CONNECTED: { label: 'Đã kết nối', class: 'success' },
        FAILED: { label: 'Lỗi', class: 'danger' },
    };

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('desc');
        }
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return null;
        return sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
    };

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const data: any = {
            name: formData.get('name'),
            partnerId: formData.get('partnerId') || null,
            notes: formData.get('notes') || null,
        };

        // Create only fields
        if (!selectedInvoiceMCC) {
            data.mccInvoiceId = formData.get('mccInvoiceId');
        } else {
            // Update only fields
            data.status = formData.get('status');
            data.creditStatus = formData.get('creditStatus');
        }

        if (data.partnerId === '') data.partnerId = null;

        if (selectedInvoiceMCC) {
            updateMutation.mutate({ id: selectedInvoiceMCC.id, data });
        } else {
            createMutation.mutate(data);
        }
    };

    const spendingDaysLabels: Record<number, string> = {
        1: 'Hôm nay',
        3: '3 ngày',
        7: '7 ngày',
        14: '14 ngày',
        30: '30 ngày',
        60: '60 ngày',
        90: '90 ngày',
        180: '180 ngày',
        360: '360 ngày'
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Invoice MCC (MI)</h1>
                    <p className="page-subtitle">Quản lý MCC invoice cho thanh toán</p>
                </div>
                {canLinkMI(user?.role || 'VIEWER') && (
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            className="btn btn-secondary"
                            onClick={() => setShowImportModal(true)}
                        >
                            <Upload size={18} />
                            Thêm từ file
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={() => {
                                setSelectedInvoiceMCC(null);
                                setShowModal(true);
                            }}
                        >
                            <Plus size={18} />
                            Thêm MI mới
                        </button>
                    </div>
                )}
            </div>

            <div className="card" style={{ overflow: 'visible' }}>
                <div className="card-header" style={{ gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                    {selectedIds.size > 0 && (
                        <div className="selection-overlay">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <span style={{ fontWeight: 500 }}>
                                    Đã chọn <strong style={{ color: 'var(--primary)' }}>{selectedIds.size}</strong> Invoice MCC
                                </span>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                    className="btn btn-secondary"
                                    onClick={async (e) => {
                                        e.currentTarget.blur();
                                        try {
                                            const idList = invoiceMCCs
                                                .filter((i: any) => selectedIds.has(i.id))
                                                .map((i: any) => i.mccInvoiceId || i.id)
                                                .join('\n');
                                            await navigator.clipboard.writeText(idList);
                                            showToast(`Đã sao chép ${selectedIds.size} ID vào clipboard`, 'success');
                                        } catch (err) {
                                            showToast('Lỗi khi sao chép', 'error');
                                        }
                                    }}
                                >
                                    <Copy size={16} />
                                    Sao chép ID
                                </button>
                                <Dropdown
                                    trigger={
                                        <button
                                            className="btn btn-secondary"
                                            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                                        >
                                            Thao tác
                                            <ChevronDown size={14} />
                                        </button>
                                    }
                                    items={[
                                        {
                                            key: 'update-status',
                                            label: 'Cập nhật thông tin',
                                            icon: <Edit2 size={14} />,
                                            onClick: () => setShowBulkEditStatus(true)
                                        },
                                        { type: 'divider', key: 'd1', label: '' },
                                        {
                                            key: 'delete-mcc',
                                            label: 'Xóa Invoice MCC',
                                            icon: <Trash2 size={14} />,
                                            danger: true,
                                            onClick: () => setConfirmBulkDelete(true)
                                        }
                                    ]}
                                />

                                <button
                                    className="btn btn-secondary"
                                    onClick={() => {
                                        setSelectedIds(new Set());
                                    }}
                                >
                                    Bỏ chọn
                                </button>
                            </div>
                        </div>
                    )}
                    <Filter size={18} style={{ color: 'var(--text-muted)' }} />
                    <div style={{ position: 'relative' }}>
                        <button
                            className={`btn ${search || isSearchOpen ? 'btn-primary' : 'btn-secondary'} `}
                            onClick={() => setIsSearchOpen(true)}
                            style={{ gap: 8 }}
                        >
                            <Search size={16} />
                            {search ? `Tìm: ${search} ` : 'Tìm kiếm'}
                            <ChevronDown size={14} />
                        </button>

                        <SearchDropdown
                            isOpen={isSearchOpen}
                            onClose={() => setIsSearchOpen(false)}
                            onApply={(value) => {
                                setSearch(value.trim());
                                setIsSearchOpen(false);
                                setPage(1);
                            }}
                            onClear={() => {
                                setSearch('');
                                setIsSearchOpen(false);
                                setPage(1);
                            }}
                            initialValue={search}
                            placeholder="Nhập tên MI, email hoặc dán danh sách ID (mỗi dòng một ID)..."
                        />
                    </div>

                    <Dropdown
                        trigger={
                            <button className="btn btn-secondary" style={{ gap: 6 }}>
                                {spendingDaysLabels[spendingDays]}
                                <ChevronDown size={14} />
                            </button>
                        }
                        items={[
                            { key: '1', label: 'Hôm nay', onClick: () => setSpendingDays(1) },
                            { key: '3', label: '3 ngày', onClick: () => setSpendingDays(3) },
                            { key: '7', label: '7 ngày', onClick: () => setSpendingDays(7) },
                            { key: '14', label: '14 ngày', onClick: () => setSpendingDays(14) },
                            { key: '30', label: '30 ngày', onClick: () => setSpendingDays(30) },
                            { key: '60', label: '60 ngày', onClick: () => setSpendingDays(60) },
                            { key: '90', label: '90 ngày', onClick: () => setSpendingDays(90) },
                            { key: '180', label: '180 ngày', onClick: () => setSpendingDays(180) },
                            { key: '360', label: '360 ngày', onClick: () => setSpendingDays(360) },
                        ]}
                    />
                </div>
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th style={{ width: 40, textAlign: 'center' }}>
                                    <input
                                        type="checkbox"
                                        className="form-checkbox"
                                        checked={allSelected}
                                        ref={(el) => {
                                            if (el) el.indeterminate = someSelected && !allSelected;
                                        }}
                                        onChange={toggleSelectAll}
                                        style={{ cursor: 'pointer' }}
                                    />
                                </th>
                                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('name')}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        Tên <SortIcon field="name" />
                                    </div>
                                </th>
                                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('mccInvoiceId')}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        MCC Invoice ID <SortIcon field="mccInvoiceId" />
                                    </div>
                                </th>
                                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('status')}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        Trạng thái <SortIcon field="status" />
                                    </div>
                                </th>
                                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('creditStatus')}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        Tín dụng <SortIcon field="creditStatus" />
                                    </div>
                                </th>
                                <th style={{ textAlign: 'right' }}>Tài khoản</th>               <th style={{ textAlign: 'right' }}>Sống</th>
                                <th style={{ width: '10%', cursor: 'pointer', userSelect: 'none', textAlign: 'right' }} onClick={() => handleSort('rangeSpending')}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                                        Chi phí <SortIcon field="rangeSpending" />
                                    </div>
                                </th>
                                <th style={{ width: '15%', textAlign: 'center' }}>Đối tác</th>
                                <th style={{ width: '120px', textAlign: 'right' }}>Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={9} style={{ textAlign: 'center', padding: 40 }}>
                                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12 }}>
                                            <div className="spinner" />
                                            <span style={{ color: 'var(--text-muted)' }}>Đang tải dữ liệu...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : invoiceMCCs.length > 0 ? (
                                invoiceMCCs.map((mi: InvoiceMCC, index: number) => (
                                    <tr
                                        key={mi.id}
                                        onClick={(e) => {
                                            if (window.getSelection()?.toString()) return;
                                            const url = `/invoice-mccs/${mi.id}`;
                                            if (e.metaKey || e.ctrlKey) {
                                                window.open(url, '_blank');
                                            } else {
                                                navigate(url);
                                            }
                                        }}
                                        style={{ cursor: 'pointer' }}
                                        className={`clickable-row ${selectedIds.has(mi.id) ? 'selected' : ''}`}
                                    >
                                        <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
                                            <input
                                                type="checkbox"
                                                className="form-checkbox"
                                                checked={selectedIds.has(mi.id)}
                                                onChange={(e) => toggleSelect(mi.id, index, e)}
                                                style={{ cursor: 'pointer' }}
                                            />
                                        </td>
                                        <td><strong>{mi.name}</strong></td>
                                        <td><code>{mi.mccInvoiceId}</code></td>
                                        <td>
                                            <span className={`badge badge-${statusLabels[mi.status]?.class || 'info'}`} style={{ whiteSpace: 'nowrap' }}>
                                                {statusLabels[mi.status]?.label || mi.status}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`badge badge-${creditStatusLabels[mi.creditStatus]?.class || 'info'}`}>
                                                {creditStatusLabels[mi.creditStatus]?.label || mi.creditStatus}
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <a
                                                href={`/accounts?miId=${mi.id}`}
                                                className="link"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    const url = `/accounts?miId=${mi.id}`;
                                                    if (e.metaKey || e.ctrlKey) {
                                                        window.open(url, '_blank');
                                                    } else {
                                                        navigate(url);
                                                    }
                                                }}
                                                style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 500, textDecoration: 'none' }}
                                            >
                                                {mi._count?.accounts ?? mi.linkedAccountsCount ?? 0}
                                            </a>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <a
                                                href={`/accounts?miId=${mi.id}&status=ACTIVE`}
                                                className="link"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    const url = `/accounts?miId=${mi.id}&status=ACTIVE`;
                                                    if (e.metaKey || e.ctrlKey) {
                                                        window.open(url, '_blank');
                                                    } else {
                                                        navigate(url);
                                                    }
                                                }}
                                                style={{ color: '#10b981', cursor: 'pointer', fontWeight: 500, textDecoration: 'none' }}
                                            >
                                                {mi.activeAccountsCount}
                                            </a>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <span style={{ fontWeight: 600, fontSize: 13, color: (mi.rangeSpending || 0) > 0 ? '#10b981' : 'inherit' }}>
                                                ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(mi.rangeSpending || 0)}
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            {mi.partner ? (
                                                <a
                                                    href={`/partners/${mi.partner?.id}`}
                                                    className="link"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        const url = `/partners/${mi.partner?.id}`;
                                                        if (e.metaKey || e.ctrlKey) {
                                                            window.open(url, '_blank');
                                                        } else {
                                                            navigate(url);
                                                        }
                                                    }}
                                                    style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 500, textDecoration: 'none' }}
                                                >
                                                    {mi.partner.name}
                                                </a>
                                            ) : '-'}
                                        </td>
                                        <td>
                                            {canLinkMI(user?.role || 'VIEWER') && (
                                                <div className="actions" style={{ justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        className="btn-icon"
                                                        title="Chỉnh sửa"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedInvoiceMCC(mi);
                                                            setShowModal(true);
                                                        }}
                                                    >
                                                        <Edit2 size={18} />
                                                    </button>
                                                    <button
                                                        className="btn-icon danger"
                                                        title="Xóa"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setDeleteId(mi.id);
                                                        }}
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                                            <Search size={32} style={{ opacity: 0.3 }} />
                                            <span>Không tìm thấy Invoice MCC nào phù hợp</span>
                                            {search && (
                                                <button className="btn btn-secondary btn-sm" onClick={() => { setSearch(''); setPage(1); }}>
                                                    Xóa bộ lọc
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {pagination.total > 0 && (
                <div className="pagination-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Số hàng hiển thị:</span>
                        <select
                            className="form-select"
                            style={{ width: 'auto', padding: '4px 8px', fontSize: 13 }}
                            value={limit}
                            onChange={(e) => {
                                setLimit(Number(e.target.value));
                                setPage(1);
                            }}
                        >
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                            <option value={30}>30</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                        </select>
                        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                            {((page - 1) * limit) + 1} - {Math.min(page * limit, pagination.total)} trong tổng số {pagination.total}
                        </span>
                    </div>

                    <div className="pagination">
                        <button
                            className="pagination-btn"
                            disabled={page <= 1}
                            onClick={() => setPage(page - 1)}
                        >
                            ← Trước
                        </button>
                        <span className="pagination-info">
                            Trang {page} / {pagination.pages}
                        </span>
                        <button
                            className="pagination-btn"
                            disabled={page >= pagination.pages}
                            onClick={() => setPage(page + 1)}
                        >
                            Sau →
                        </button>
                    </div>
                </div>
            )}

            {
                showModal && (
                    <div className="modal-overlay" onClick={() => setShowModal(false)}>
                        <div className="modal" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3 className="modal-title">
                                    {selectedInvoiceMCC ? 'Cập nhật Invoice MCC' : 'Thêm Invoice MCC mới'}
                                </h3>
                                <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
                            </div>
                            <form onSubmit={handleSubmit}>
                                <div className="modal-body">
                                    <div className="form-group">
                                        <label className="form-label">Tên MI *</label>
                                        <input
                                            name="name"
                                            type="text"
                                            className="form-input"
                                            defaultValue={selectedInvoiceMCC?.name}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">MCC Invoice ID *</label>
                                        <input
                                            name="mccInvoiceId"
                                            type="text"
                                            className="form-input"
                                            placeholder="xxx-xxx-xxxx"
                                            defaultValue={selectedInvoiceMCC?.mccInvoiceId}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Đối tác</label>
                                        <select
                                            name="partnerId"
                                            className="form-select"
                                            defaultValue={selectedInvoiceMCC?.partner?.id || selectedInvoiceMCC?.partnerId || ''}
                                        >
                                            <option value="">-- Chọn đối tác --</option>
                                            {partners.map((p: Partner) => (
                                                <option key={p.id} value={p.id}>{p.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {selectedInvoiceMCC && (
                                        <>
                                            <div className="form-group">
                                                <label className="form-label">Trạng thái</label>
                                                <select
                                                    name="status"
                                                    className="form-select"
                                                    defaultValue={selectedInvoiceMCC.status}
                                                >
                                                    <option value="ACTIVE">Hoạt động</option>
                                                    <option value="PENDING">Chờ kết nối</option>
                                                    <option value="EXHAUSTED">Hết tín dụng</option>
                                                    <option value="INACTIVE">Không hoạt động</option>
                                                </select>
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Tín dụng</label>
                                                <select
                                                    name="creditStatus"
                                                    className="form-select"
                                                    defaultValue={selectedInvoiceMCC.creditStatus}
                                                >
                                                    <option value="PENDING">Chờ kết nối</option>
                                                    <option value="CONNECTED">Đã kết nối</option>
                                                    <option value="FAILED">Lỗi</option>
                                                </select>
                                            </div>
                                        </>
                                    )}
                                    <div className="form-group">
                                        <label className="form-label">Ghi chú</label>
                                        <textarea
                                            name="notes"
                                            className="form-input"
                                            rows={3}
                                            defaultValue={selectedInvoiceMCC?.notes || ''}
                                        />
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Hủy</button>
                                    <button
                                        type="submit"
                                        className="btn btn-primary"
                                        disabled={createMutation.isPending || updateMutation.isPending}
                                    >
                                        {createMutation.isPending || updateMutation.isPending ? 'Đang xử lý...' : (selectedInvoiceMCC ? 'Cập nhật' : 'Tạo MI')}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {
                deleteId && (
                    <div className="modal-overlay" onClick={() => setDeleteId(null)}>
                        <div className="modal" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3 className="modal-title">Xác nhận xóa</h3>
                                <button className="modal-close" onClick={() => setDeleteId(null)}>×</button>
                            </div>
                            <div className="modal-body">
                                <p>Bạn có chắc chắn muốn xóa Invoice MCC này không? Hành động này không thể hoàn tác.</p>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setDeleteId(null)}>Hủy</button>
                                <button
                                    className="btn btn-danger"
                                    onClick={() => deleteId && deleteMutation.mutate(deleteId)}
                                    disabled={deleteMutation.isPending}
                                >
                                    {deleteMutation.isPending ? 'Đang xóa...' : 'Xóa'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Bulk Info Edit Modal */}
            {
                showBulkEditStatus && (
                    <div className="modal-overlay" onClick={() => setShowBulkEditStatus(false)}>
                        <div className="modal" style={{ maxWidth: '460px' }} onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3 className="modal-title">Cập nhật thông tin ({selectedIds.size} MI)</h3>
                                <button className="modal-close" onClick={() => setShowBulkEditStatus(false)}>×</button>
                            </div>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Trạng thái</label>
                                    <select
                                        className="form-select"
                                        value={bulkStatus}
                                        onChange={(e) => setBulkStatus(e.target.value)}
                                    >
                                        <option value="">-- Không thay đổi --</option>
                                        <option value="ACTIVE">Hoạt động</option>
                                        <option value="PENDING">Chờ kết nối</option>
                                        <option value="EXHAUSTED">Hết tín dụng</option>
                                        <option value="INACTIVE">Không hoạt động</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Tín dụng</label>
                                    <select
                                        className="form-select"
                                        value={bulkCreditStatus}
                                        onChange={(e) => setBulkCreditStatus(e.target.value)}
                                    >
                                        <option value="">-- Không thay đổi --</option>
                                        <option value="PENDING">Chờ kết nối</option>
                                        <option value="CONNECTED">Đã kết nối</option>
                                        <option value="FAILED">Lỗi</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Đối tác</label>
                                    <select
                                        className="form-select"
                                        value={bulkPartnerId}
                                        onChange={(e) => setBulkPartnerId(e.target.value)}
                                    >
                                        <option value="">-- Không thay đổi --</option>
                                        <option value="__CLEAR__">Xóa đối tác</option>
                                        {partners.map((p: Partner) => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setShowBulkEditStatus(false)}>Hủy</button>
                                <button
                                    className="btn btn-primary"
                                    onClick={() => {
                                        if (!bulkStatus && !bulkCreditStatus && !bulkPartnerId) return;
                                        bulkUpdateStatusMutation.mutate({
                                            ids: Array.from(selectedIds),
                                            status: bulkStatus || undefined,
                                            creditStatus: bulkCreditStatus || undefined,
                                            partnerId: bulkPartnerId === '__CLEAR__' ? '' : (bulkPartnerId || undefined),
                                        });
                                    }}
                                    disabled={bulkUpdateStatusMutation.isPending || (!bulkStatus && !bulkCreditStatus && !bulkPartnerId)}
                                >
                                    {bulkUpdateStatusMutation.isPending ? 'Đang cập nhật...' : 'Cập nhật hàng loạt'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Bulk Delete Confirm Modal */}
            {
                confirmBulkDelete && (
                    <div className="modal-overlay" onClick={() => setConfirmBulkDelete(false)}>
                        <div className="modal" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3 className="modal-title">Xác nhận xóa hàng loạt</h3>
                                <button className="modal-close" onClick={() => setConfirmBulkDelete(false)}>×</button>
                            </div>
                            <div className="modal-body">
                                <p>Bạn có chắc chắn muốn xóa <strong>{selectedIds.size}</strong> Invoice MCC đã chọn không?</p>
                                <p className="text-danger" style={{ fontSize: '13px', marginTop: '8px' }}>
                                    Lưu ý: Chỉ có thể xóa các Invoice MCC không có tài khoản liên kết.
                                </p>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setConfirmBulkDelete(false)}>Hủy</button>
                                <button
                                    className="btn btn-danger"
                                    onClick={() => {
                                        bulkDeleteMutation.mutate(Array.from(selectedIds));
                                    }}
                                    disabled={bulkDeleteMutation.isPending}
                                >
                                    {bulkDeleteMutation.isPending ? 'Đang xóa...' : 'Xác nhận xóa'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
            {/* Import Modal */}
            {
                showImportModal && (
                    <div className="modal-overlay" onClick={closeImportModal}>
                        <div
                            className="modal"
                            style={{
                                maxWidth: modalStep === 'preview' ? '900px' : '500px',
                                maxHeight: modalStep === 'preview' ? '85vh' : 'auto',
                                display: 'flex',
                                flexDirection: 'column'
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="modal-header" style={{ flexShrink: 0 }}>
                                <h3 className="modal-title">
                                    {modalStep === 'upload' ? 'Import Invoice MCC từ Excel' : 'Xác nhận thông tin MI'}
                                </h3>
                                <button className="modal-close" onClick={closeImportModal}>×</button>
                            </div>

                            <div className="modal-body" style={{ flex: 1, overflow: modalStep === 'preview' ? 'hidden' : 'auto', display: 'flex', flexDirection: 'column' }}>
                                {modalStep === 'upload' && (
                                    <>
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            accept=".xlsx,.xls"
                                            onChange={handleFileSelect}
                                            style={{ display: 'none' }}
                                        />

                                        <div
                                            className="file-upload"
                                            onClick={() => fileInputRef.current?.click()}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            {parseMutation.isPending ? (
                                                <>
                                                    <div className="spinner" style={{ width: 48, height: 48 }}></div>
                                                    <p className="file-upload-text">Đang xử lý file...</p>
                                                </>
                                            ) : file ? (
                                                <>
                                                    <FileSpreadsheet size={48} style={{ color: 'var(--secondary)' }} />
                                                    <p className="file-upload-text">{file.name}</p>
                                                    <p className="file-upload-hint">{(file.size / 1024).toFixed(1)} KB</p>
                                                </>
                                            ) : (
                                                <>
                                                    <Upload size={48} />
                                                    <p className="file-upload-text">Click để chọn file Excel</p>
                                                    <p className="file-upload-hint">
                                                        Hỗ trợ định dạng .xlsx, .xls - Báo cáo hiệu suất từ Google Ads
                                                    </p>
                                                </>
                                            )}
                                        </div>

                                        {parseError && (
                                            <div style={{
                                                marginTop: 16,
                                                padding: 12,
                                                background: 'rgba(239, 68, 68, 0.1)',
                                                borderRadius: 8,
                                                color: 'var(--danger)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8
                                            }}>
                                                <AlertCircle size={20} />
                                                {parseError}
                                            </div>
                                        )}
                                    </>
                                )}

                                {modalStep === 'preview' && parsedData && (
                                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                                        <div style={{ flexShrink: 0, marginBottom: 16 }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                                                <div className="form-group" style={{ margin: 0 }}>
                                                    <label className="form-label">Tên Invoice MCC *</label>
                                                    <input
                                                        type="text"
                                                        className={`form-input ${!editedMiName ? 'border-danger' : ''}`}
                                                        style={!editedMiName ? { borderColor: 'var(--danger)' } : {}}
                                                        value={editedMiName}
                                                        onChange={(e) => setEditedMiName(e.target.value)}
                                                        placeholder="Nhập tên MI"
                                                    />
                                                </div>
                                                <div className="form-group" style={{ margin: 0 }}>
                                                    <label className="form-label">MCC Invoice ID *</label>
                                                    <input
                                                        type="text"
                                                        className={`form-input ${!editedMccInvoiceId ? 'border-danger' : ''}`}
                                                        style={!editedMccInvoiceId ? { borderColor: 'var(--danger)' } : {}}
                                                        value={editedMccInvoiceId}
                                                        onChange={(e) => setEditedMccInvoiceId(e.target.value)}
                                                        placeholder="xxx-xxx-xxxx"
                                                    />
                                                </div>
                                            </div>

                                            <div className="form-group" style={{ margin: 0 }}>
                                                <label className="form-label">Đối tác</label>
                                                <select
                                                    className="form-select"
                                                    value={editedPartnerId}
                                                    onChange={(e) => setEditedPartnerId(e.target.value)}
                                                >
                                                    <option value="">-- Chọn đối tác --</option>
                                                    {partners.map((p: Partner) => (
                                                        <option key={p.id} value={p.id}>{p.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        {/* Accounts Preview Table - Scrollable */}
                                        <div style={{
                                            flex: 1,
                                            minHeight: 200,
                                            overflow: 'auto',
                                            border: '1px solid var(--border)',
                                            borderRadius: 8
                                        }}>
                                            <table className="data-table" style={{ marginBottom: 0 }}>
                                                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 1 }}>
                                                    <tr>
                                                        <th>ID</th>
                                                        <th>Tên tài khoản</th>
                                                        <th>Trạng thái</th>
                                                        <th>Tiền tệ</th>
                                                        <th>Ghi chú</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {parsedData.accounts.map((account: any, index: number) => (
                                                        <tr key={index}>
                                                            <td><code>{account.googleAccountId}</code></td>
                                                            <td>{account.accountName}</td>
                                                            <td>
                                                                <span className={`badge badge-${statusLabels[account.status]?.class || 'info'}`}>
                                                                    {statusLabels[account.status]?.label || account.status}
                                                                </span>
                                                            </td>
                                                            <td>{account.currency}</td>
                                                            <td>
                                                                {account.existsInDb && (
                                                                    <span style={{ color: 'var(--warning)', fontSize: 12 }}>
                                                                        Đã tồn tại (sẽ cập nhận)
                                                                    </span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="modal-footer" style={{ flexShrink: 0 }}>
                                {modalStep === 'upload' ? (
                                    <button type="button" className="btn btn-secondary" onClick={closeImportModal}>
                                        Hủy
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            onClick={() => {
                                                setModalStep('upload');
                                                setFile(null);
                                                setParsedData(null);
                                            }}
                                        >
                                            ← Chọn file khác
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-primary"
                                            disabled={!editedMiName || !editedMccInvoiceId || createImportMutation.isPending}
                                            onClick={handleImportCreate}
                                        >
                                            {createImportMutation.isPending ? (
                                                parsedData?.existingMi ? 'Đang cập nhật...' : 'Đang tạo...'
                                            ) : (
                                                <>
                                                    <CheckCircle size={18} />
                                                    {parsedData?.existingMi ? 'Xác nhận cập nhật MI' : 'Xác nhận tạo MI'} ({parsedData?.accounts.length} tài khoản)
                                                </>
                                            )}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }
            {/* Toast Notification */}
            {
                toast && (
                    <div className={`toast toast-${toast.type}`}>
                        {toast.type === 'success' ? '✓' : '✕'} {toast.message}
                    </div>
                )
            }
        </div >
    );
}
