import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, Upload, FileSpreadsheet, CheckCircle, AlertCircle, Edit2, Trash2, Filter, ChevronDown, ChevronUp, X } from 'lucide-react';
import { batchesApi, importApi, partnersApi } from '../api/client';
import { useAuthStore, canManageBatches } from '../store/authStore';
import Dropdown from '../components/Dropdown';

interface Batch {
    id: string;
    mccAccountName: string;
    mccAccountId: string | null;
    status: string;
    totalAccounts: number;
    liveAccounts: number;
    partner: { id: string; name: string } | null;
    partnerId?: string | null;
    timezone?: string | null;
    year?: number | null;
    readiness: number;
    notes?: string | null;
    createdAt: string;
    rangeSpending?: number;
    _count?: { accounts: number };
}

const TIMEZONES = [
    'UTC-12', 'UTC-11', 'UTC-10', 'UTC-9', 'UTC-8', 'UTC-7', 'UTC-6', 'UTC-5', 'UTC-4', 'UTC-3', 'UTC-2', 'UTC-1',
    'UTC+0', 'UTC+1', 'UTC+2', 'UTC+3', 'UTC+4', 'UTC+5', 'UTC+6', 'UTC+7', 'UTC+8', 'UTC+9', 'UTC+10', 'UTC+11', 'UTC+12'
];

interface Partner {
    id: string;
    name: string;
}

interface ParsedAccount {
    status: string;
    accountName: string;
    googleAccountId: string;
    currency: string;
    existsInDb: boolean;
    existingBatchId: string | null;
}

type SortField = 'mccAccountName' | 'mccAccountId' | 'status' | 'readiness' | 'timezone' | 'year' | 'partner' | 'createdAt';
type SortOrder = 'asc' | 'desc';

interface ParsedBatchData {
    mccAccountId: string;
    mccAccountName: string;
    dateRange: string;
    accounts: ParsedAccount[];
    summary: {
        total: number;
        active: number;
        suspended: number;
        existing: number;
        new: number;
    };
}

export default function Batches() {
    const { user } = useAuthStore();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [search, setSearch] = useState(searchParams.get('search') || '');
    const [idsFilter, setIdsFilter] = useState(searchParams.get('ids') || '');
    const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
    const [timezoneFilter, setTimezoneFilter] = useState(searchParams.get('timezone') || '');
    const [yearFilter, setYearFilter] = useState(searchParams.get('year') || '');
    const [partnerFilter, setPartnerFilter] = useState(searchParams.get('partnerId') || '');

    const [spendingDays, setSpendingDays] = useState(1);

    const [page, setPage] = useState(1);
    const [limit] = useState(20);

    // Sorting
    const [sortField, setSortField] = useState<SortField>('createdAt');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

    // Search UI State
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const searchDropdownRef = useRef<HTMLDivElement>(null);

    // Selection State
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null);
    const [showBulkEditModal, setShowBulkEditModal] = useState(false);
    const [bulkStatus, setBulkStatus] = useState('');
    const [bulkReadiness, setBulkReadiness] = useState<number | undefined>(undefined);


    const [showImportModal, setShowImportModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [modalStep, setModalStep] = useState<'upload' | 'preview'>('upload');
    const [file, setFile] = useState<File | null>(null);
    const [parsedData, setParsedData] = useState<ParsedBatchData | null>(null);
    const [editedMccAccountId, setEditedMccAccountId] = useState('');
    const [editedMccAccountName, setEditedMccAccountName] = useState('');
    const [editedTimezone, setEditedTimezone] = useState('');
    const [editedYear, setEditedYear] = useState<number | ''>('');
    const [editedReadiness, setEditedReadiness] = useState(0);
    const [parseError, setParseError] = useState<string | null>(null);

    // CRUD State
    const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const queryClient = useQueryClient();

    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
    };

    // Close search dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchDropdownRef.current && !searchDropdownRef.current.contains(event.target as Node)) {
                setIsSearchOpen(false);
            }
        };
        if (isSearchOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isSearchOpen]);

    // Sync URL params
    useEffect(() => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (search) next.set('search', search); else next.delete('search');
            if (idsFilter) next.set('ids', idsFilter); else next.delete('ids');
            if (statusFilter) next.set('status', statusFilter); else next.delete('status');
            if (timezoneFilter) next.set('timezone', timezoneFilter); else next.delete('timezone');
            if (yearFilter) next.set('year', yearFilter); else next.delete('year');
            if (partnerFilter) next.set('partnerId', partnerFilter); else next.delete('partnerId');
            return next;
        }, { replace: true });
    }, [search, idsFilter, statusFilter, timezoneFilter, yearFilter, partnerFilter, setSearchParams]);

    const { data, isLoading } = useQuery({
        queryKey: ['batches', search, spendingDays, idsFilter, statusFilter, timezoneFilter, yearFilter, partnerFilter, page, limit, sortField, sortOrder],
        queryFn: () => batchesApi.list({
            search,
            spendingDays,
            ids: idsFilter || undefined,
            status: statusFilter || undefined,
            timezone: timezoneFilter || undefined,
            year: yearFilter || undefined,
            partnerId: partnerFilter || undefined,
            page,
            limit,
            sortBy: sortField,
            sortOrder
        }),
    });

    const batches = (data?.data?.data || []) as Batch[];
    const pagination = data?.data?.pagination || { total: 0, totalPages: 1 };

    // Handlers
    const handleApplySearch = () => {
        const trimmed = searchQuery.trim();
        if (!trimmed) {
            setSearch('');
            setIdsFilter('');
        } else {
            // Check if input looks like a list of IDs (multiple lines or comma separated)
            // or if it's a single line fully matching an ID pattern or just digits/hyphens
            const lines = trimmed.split(/[\n,]+/).map(t => t.trim()).filter(Boolean);

            // Heuristic: If multiple items, treat as IDs.
            // If single item, check if it looks like an ID (digits, dashes). 
            // If it has letters, treat as Search (Name/ID partial).
            const isMultiple = lines.length > 1;
            const isIdPattern = lines.every(l => /^[\d-]+$/.test(l));

            if (isMultiple || isIdPattern) {
                setIdsFilter(lines.join('\n'));
                setSearch('');
            } else {
                setSearch(trimmed);
                setIdsFilter('');
            }
        }
        setIsSearchOpen(false);
        setPage(1);
    };

    const handleOpenSearch = () => {
        if (idsFilter) {
            setSearchQuery(idsFilter);
        } else if (search) {
            setSearchQuery(search);
        } else {
            setSearchQuery('');
        }
        setIsSearchOpen(true);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleApplySearch();
        }
    };

    const resetFilters = () => {
        setSearch('');
        setIdsFilter('');
        setStatusFilter('');
        setTimezoneFilter('');
        setYearFilter('');
        setPartnerFilter('');
        setPage(1);
        setSearchQuery('');
        setSearchParams({});
    };

    // Sorting Handlers
    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return null;
        return sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
    };

    // Selection Logic
    const allSelected = (batches.length > 0 && batches.every(b => selectedIds.has(b.id)));

    const toggleSelectAll = () => {
        if (allSelected) {
            const newSet = new Set(selectedIds);
            batches.forEach(b => newSet.delete(b.id));
            setSelectedIds(newSet);
        } else {
            const newSet = new Set(selectedIds);
            batches.forEach(b => newSet.add(b.id));
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
                    const batchId = batches[i]?.id;
                    if (batchId) {
                        if (shouldSelect) next.add(batchId);
                        else next.delete(batchId);
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

    const handleBulkSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedIds.size === 0) return;

        bulkUpdateMutation.mutate({
            ids: Array.from(selectedIds),
            status: bulkStatus || undefined,
            readiness: bulkReadiness
        });
    };

    const { data: partnersData } = useQuery({
        queryKey: ['partnersList'],
        queryFn: () => partnersApi.list(),
    });

    // Bulk Update Mutation
    const bulkUpdateMutation = useMutation({
        mutationFn: (data: { ids: string[], status?: string, readiness?: number }) =>
            batchesApi.bulkUpdate(data.ids, data.status, data.readiness),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['batches'] });
            setShowBulkEditModal(false);
            setSelectedIds(new Set());
            setBulkStatus('');
            setBulkReadiness(undefined);
            showToast(`Cập nhật thành công!`, 'success');
        },
        onError: () => showToast('Cập nhật thất bại', 'error')
    });

    const parseMutation = useMutation({
        mutationFn: (file: File) => importApi.parseBatch(file),
        onSuccess: (response) => {
            const data = response.data as ParsedBatchData;
            setParsedData(data);
            setEditedMccAccountId(data.mccAccountId || '');
            setEditedMccAccountName(data.mccAccountName || '');
            setEditedTimezone('');
            setEditedYear('');
            setEditedReadiness(0);
            setModalStep('preview');
            setParseError(null);
        },
        onError: (error: any) => {
            setParseError(error.response?.data?.error || 'Không thể đọc file Excel');
        },
    });

    const createMutation = useMutation({
        mutationFn: (data: {
            mccAccountId: string | null;
            mccAccountName: string;
            timezone?: string | null;
            year?: number | null;
            readiness?: number;
            accounts: ParsedAccount[];
        }) => importApi.createBatchWithAccounts(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['batches'] });
            closeImportModal();
            showToast('Tạo lô tài khoản thành công', 'success');
        },
        onError: (error: any) => {
            showToast(error.response?.data?.error || 'Có lỗi xảy ra', 'error');
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: object }) => batchesApi.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['batches'] });
            setShowEditModal(false);
            setSelectedBatch(null);
            showToast('Cập nhật lô tài khoản thành công', 'success');
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
        mutationFn: (id: string) => batchesApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['batches'] });
            setDeleteId(null);
            showToast('Xóa lô tài khoản thành công', 'success');
        },
        onError: (error: any) => {
            setDeleteId(null);
            const errData = error.response?.data?.error;
            let message = 'Không thể xóa lô tài khoản này';
            if (typeof errData === 'string') {
                message = errData;
            } else if (Array.isArray(errData)) {
                message = errData.map((e: any) => e.message).join(', ');
            }
            showToast(message, 'error');
        },
    });

    // Old batch declaration removed
    // const batches = data?.data?.data || [];
    const partners = partnersData?.data?.data || [];

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            setParseError(null);
            parseMutation.mutate(selectedFile);
        }
    };

    const handleCreate = () => {
        if (!parsedData) return;
        createMutation.mutate({
            mccAccountId: editedMccAccountId || null,
            mccAccountName: editedMccAccountName,
            timezone: editedTimezone || null,
            year: editedYear !== '' ? editedYear : null,
            readiness: editedReadiness,
            accounts: parsedData.accounts,
        });
    };

    const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!selectedBatch) return;
        const formData = new FormData(e.currentTarget);
        updateMutation.mutate({
            id: selectedBatch.id,
            data: {
                mccAccountName: formData.get('mccAccountName'),
                mccAccountId: formData.get('mccAccountId'),
                partnerId: formData.get('partnerId') || null,
                status: formData.get('status'),
                timezone: formData.get('timezone'),
                year: formData.get('year') ? parseInt(formData.get('year') as string) : null,
                readiness: parseInt(formData.get('readiness') as string) || 0,
                notes: formData.get('notes'),
            },
        });
    };

    const closeImportModal = () => {
        setShowImportModal(false);
        setModalStep('upload');
        setFile(null);
        setParsedData(null);
        setParseError(null);
        setEditedMccAccountId('');
        setEditedMccAccountName('');
        setEditedTimezone('');
        setEditedYear('');
        setEditedReadiness(0);
    };

    const statusLabels: Record<string, { label: string; class: string }> = {
        ACTIVE: { label: 'Hoạt động', class: 'success' },
        INACTIVE: { label: 'Không hoạt động', class: 'danger' },
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Lô tài khoản (MA)</h1>
                    <p className="page-subtitle">Quản lý các lô tài khoản Google Ads</p>
                </div>
                {canManageBatches(user?.role || 'VIEWER') && (
                    <button className="btn btn-primary" onClick={() => setShowImportModal(true)}>
                        <Plus size={18} />
                        Thêm lô mới
                    </button>
                )}
            </div>

            {/* Selection Action Bar */}
            {selectedIds.size > 0 && (
                <div style={{
                    marginBottom: 16,
                    padding: '8px 16px',
                    background: 'rgba(99, 102, 241, 0.1)',
                    border: '1px solid var(--primary)',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontWeight: 500, color: 'var(--primary)' }}>
                            Đã chọn {selectedIds.size} lô
                        </span>
                        <div style={{ height: 20, width: 1, background: 'var(--primary)', opacity: 0.3 }} />

                        {canManageBatches(user?.role || 'VIEWER') && (
                            <button
                                className="btn btn-sm btn-primary"
                                onClick={() => setShowBulkEditModal(true)}
                                style={{ gap: 6 }}
                            >
                                <Edit2 size={14} />
                                Cập nhật hàng loạt
                            </button>
                        )}
                    </div>
                </div>
            )}

            <div className="card">
                <div className="card-header" style={{ gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                    <Filter size={18} style={{ color: 'var(--text-muted)' }} />

                    {/* Search Input */}
                    <div style={{ position: 'relative' }} ref={searchDropdownRef}>
                        <button
                            className={`btn ${search || idsFilter || isSearchOpen ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={handleOpenSearch}
                            style={{ gap: 8 }}
                        >
                            <Search size={16} />
                            {search ? `Tìm: ${search}` : idsFilter ? `Lọc theo ID (${idsFilter.split(/[\n,]+/).length})` : 'Tìm kiếm'}
                            <ChevronDown size={14} />
                        </button>

                        {isSearchOpen && (
                            <div style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                marginTop: 8,
                                background: 'var(--surface)',
                                border: '1px solid var(--border)',
                                borderRadius: 8,
                                padding: 16,
                                width: 400,
                                boxShadow: 'var(--shadow)',
                                zIndex: 1000,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 12
                            }}>
                                <div style={{ position: 'relative' }}>
                                    <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
                                    <textarea
                                        autoFocus
                                        className="form-input"
                                        placeholder="Nhập tên lô, ID, hoặc dán danh sách ID (mỗi dòng một ID)..."
                                        style={{
                                            width: '100%',
                                            minHeight: 120,
                                            paddingLeft: 36,
                                            resize: 'vertical',
                                            fontFamily: 'monospace'
                                        }}
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                    />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => {
                                            setSearchQuery('');
                                            setSearch('');
                                            setIdsFilter('');
                                            setIsSearchOpen(false);
                                        }}
                                    >
                                        Xóa lọc
                                    </button>
                                    <button
                                        className="btn btn-primary btn-sm"
                                        onClick={handleApplySearch}
                                    >
                                        Áp dụng
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Status Filter */}
                    <Dropdown
                        trigger={
                            <button className={`btn ${statusFilter ? 'btn-primary' : 'btn-secondary'}`} style={{ gap: 6 }}>
                                {statusFilter ? statusLabels[statusFilter]?.label : 'Trạng thái'}
                                <ChevronDown size={14} />
                            </button>
                        }
                        items={[
                            { key: 'all', label: 'Tất cả trạng thái', onClick: () => setStatusFilter('') },
                            { key: 'active', label: 'Hoạt động', onClick: () => setStatusFilter('ACTIVE') },
                            { key: 'inactive', label: 'Không hoạt động', onClick: () => setStatusFilter('INACTIVE') },
                        ]}
                    />

                    {/* Partner Filter */}
                    <Dropdown
                        trigger={
                            <button className={`btn ${partnerFilter ? 'btn-primary' : 'btn-secondary'}`} style={{ gap: 6 }}>
                                {partnerFilter ? (partners.find((p: any) => p.id === partnerFilter)?.name || 'Đối tác') : 'Đối tác'}
                                <ChevronDown size={14} />
                            </button>
                        }
                        items={[
                            { key: 'all', label: 'Tất cả đối tác', onClick: () => setPartnerFilter('') },
                            ...partners.map((p: any) => ({
                                key: p.id,
                                label: p.name,
                                onClick: () => setPartnerFilter(p.id)
                            }))
                        ]}
                    />

                    {/* Timezone Filter */}
                    <Dropdown
                        trigger={
                            <button className={`btn ${timezoneFilter ? 'btn-primary' : 'btn-secondary'}`} style={{ gap: 6 }}>
                                {timezoneFilter || 'Múi giờ'}
                                <ChevronDown size={14} />
                            </button>
                        }
                        items={[
                            { key: 'all', label: 'Tất cả múi giờ', onClick: () => setTimezoneFilter('') },
                            { key: 'utc8', label: 'UTC+8', onClick: () => setTimezoneFilter('UTC+8') },
                            { key: 'utc7', label: 'UTC+7', onClick: () => setTimezoneFilter('UTC+7') },
                            { key: 'utc-3', label: 'UTC-3', onClick: () => setTimezoneFilter('UTC-3') },
                            { key: 'utc0', label: 'UTC+0', onClick: () => setTimezoneFilter('UTC+0') },
                        ]}
                    />

                    {/* Year Filter */}
                    <Dropdown
                        trigger={
                            <button className={`btn ${yearFilter ? 'btn-primary' : 'btn-secondary'}`} style={{ gap: 6 }}>
                                {yearFilter || 'Năm'}
                                <ChevronDown size={14} />
                            </button>
                        }
                        items={[
                            { key: 'all', label: 'Tất cả', onClick: () => setYearFilter('') },
                            { key: '2024', label: '2024', onClick: () => setYearFilter('2024') },
                            { key: '2025', label: '2025', onClick: () => setYearFilter('2025') },
                            { key: '2026', label: '2026', onClick: () => setYearFilter('2026') },
                        ]}
                    />

                    {/* Reset Filter Button */}
                    {(search || statusFilter || timezoneFilter || yearFilter || partnerFilter || idsFilter) && (
                        <button
                            className="btn btn-secondary"
                            onClick={resetFilters}
                            title="Xóa tất cả bộ lọc"
                            style={{ color: 'var(--danger)' }}
                        >
                            <X size={16} /> Xóa lọc
                        </button>
                    )}
                </div>

                <div className="table-container">
                    <table className="data-table" style={{ tableLayout: 'fixed', width: '100%' }}>
                        <thead>
                            <tr>
                                <th style={{ width: 40, textAlign: 'center' }}>
                                    <input
                                        type="checkbox"
                                        checked={allSelected}
                                        onChange={toggleSelectAll}
                                        className="form-checkbox"
                                    />
                                </th>
                                <th
                                    style={{ width: '25%', cursor: 'pointer', userSelect: 'none' }}
                                    onClick={() => handleSort('mccAccountName')}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        Tên MCC Account <SortIcon field="mccAccountName" />
                                    </div>
                                </th>
                                <th
                                    style={{ width: '10%', cursor: 'pointer', userSelect: 'none' }}
                                    onClick={() => handleSort('status')}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        Trạng thái <SortIcon field="status" />
                                    </div>
                                </th>
                                <th
                                    style={{ width: '10%', cursor: 'pointer', userSelect: 'none' }}
                                    onClick={() => handleSort('readiness')}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        Readiness <SortIcon field="readiness" />
                                    </div>
                                </th>
                                <th
                                    style={{ width: '10%', cursor: 'pointer', userSelect: 'none' }}
                                    onClick={() => handleSort('timezone')}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        Múi giờ <SortIcon field="timezone" />
                                    </div>
                                </th>
                                <th
                                    style={{ width: '8%', cursor: 'pointer', userSelect: 'none' }}
                                    onClick={() => handleSort('year')}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        Năm <SortIcon field="year" />
                                    </div>
                                </th>
                                <th style={{ width: '8%' }}>Tài khoản</th>
                                <th style={{ width: '8%' }}>Sóng</th>
                                <th style={{ width: '10%' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                                        <span style={{ fontSize: 13 }}>Chi phí</span>
                                        <select
                                            value={spendingDays}
                                            onChange={(e) => setSpendingDays(Number(e.target.value))}
                                            onClick={(e) => e.stopPropagation()}
                                            style={{
                                                fontSize: 11,
                                                padding: '2px 4px',
                                                border: '1px solid var(--border)',
                                                borderRadius: 4,
                                                background: 'var(--bg-primary)',
                                                cursor: 'pointer',
                                                marginLeft: 0,
                                                width: '100%'
                                            }}
                                        >
                                            <option value={1}>Hôm nay</option>
                                            <option value={3}>3 ngày</option>
                                            <option value={7}>7 ngày</option>
                                            <option value={14}>14 ngày</option>
                                            <option value={30}>30 ngày</option>
                                        </select>
                                    </div>
                                </th>
                                <th
                                    style={{ width: '13%', cursor: 'pointer', userSelect: 'none' }}
                                    onClick={() => handleSort('partner')}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        Đối tác <SortIcon field="partner" />
                                    </div>
                                </th>
                                <th style={{ width: '120px', textAlign: 'right' }}>Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={10} style={{ textAlign: 'center', padding: 40 }}>
                                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12 }}>
                                            <div className="spinner" />
                                            <span style={{ color: 'var(--text-muted)' }}>Đang tải dữ liệu...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : batches.length > 0 ? (
                                batches.map((batch: Batch, index: number) => (
                                    <tr
                                        key={batch.id}
                                        onClick={() => {
                                            if (window.getSelection()?.toString()) return;
                                            navigate(`/batches/${batch.id}`);
                                        }}
                                        style={{ cursor: 'pointer' }}
                                        className={`clickable-row ${selectedIds.has(batch.id) ? 'selected' : ''}`}
                                    >
                                        <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.has(batch.id)}
                                                onChange={(e) => toggleSelect(batch.id, index, e)}
                                                className="form-checkbox"
                                            />
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 600 }}>{batch.mccAccountName}</div>
                                            {batch.mccAccountId ? (
                                                <div style={{ fontSize: 11, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                    <div style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{batch.mccAccountId}</div>
                                                </div>
                                            ) : (
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>-</div>
                                            )}
                                        </td>
                                        <td>
                                            <span className={`badge badge-${statusLabels[batch.status]?.class || 'secondary'}`} style={{ whiteSpace: 'nowrap' }}>
                                                {statusLabels[batch.status]?.label || batch.status}
                                            </span>
                                        </td>
                                        <td>
                                            <div style={{
                                                width: 24, height: 24,
                                                borderRadius: '50%',
                                                background: `rgba(${batch.readiness >= 8 ? '16, 185, 129' : batch.readiness >= 5 ? '245, 158, 11' : '239, 68, 68'}, 0.2)`,
                                                color: batch.readiness >= 8 ? '#10b981' : batch.readiness >= 5 ? '#f59e0b' : '#ef4444',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 12
                                            }}>
                                                {batch.readiness}
                                            </div>
                                        </td>
                                        <td>
                                            {batch.timezone || '-'}
                                        </td>
                                        <td>
                                            {batch.year || '-'}
                                        </td>
                                        <td>
                                            <span
                                                className="link"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/accounts?batchId=${batch.id}`);
                                                }}
                                                style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 500 }}
                                            >
                                                {batch.totalAccounts || batch._count?.accounts || 0}
                                            </span>
                                        </td>
                                        <td>
                                            <span style={{ color: 'var(--secondary)', fontWeight: 500 }}>{batch.liveAccounts}</span>
                                        </td>
                                        <td>
                                            <span style={{ fontWeight: 600, fontSize: 13, color: (batch.rangeSpending || 0) > 0 ? '#10b981' : 'inherit' }}>
                                                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(batch.rangeSpending || 0)}
                                            </span>
                                        </td>
                                        <td>
                                            {batch.partner ? (
                                                <span
                                                    className="link"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        navigate(`/partners?search=${batch.partner?.name}`);
                                                    }}
                                                    style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 500 }}
                                                >
                                                    {batch.partner.name}
                                                </span>
                                            ) : '-'}
                                        </td>
                                        <td>
                                            {canManageBatches(user?.role || 'VIEWER') && (
                                                <div className="actions" style={{ justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        className="btn-icon"
                                                        title="Chỉnh sửa"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedBatch(batch);
                                                            setShowEditModal(true);
                                                        }}
                                                    >
                                                        <Edit2 size={18} />
                                                    </button>
                                                    <button
                                                        className="btn-icon danger"
                                                        title="Xóa"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setDeleteId(batch.id);
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
                                    <td colSpan={10} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                                            <Search size={32} style={{ opacity: 0.3 }} />
                                            <span>Không tìm thấy lô tài khoản nào phù hợp</span>
                                            {(search || statusFilter || idsFilter || partnerFilter || timezoneFilter || yearFilter) && (
                                                <button className="btn btn-secondary btn-sm" onClick={resetFilters}>
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

                {/* Pagination */}
                {pagination && pagination.totalPages > 1 && (
                    <div className="pagination" style={{ padding: '16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'center', gap: 8 }}>
                        <button
                            className="btn btn-secondary btn-sm"
                            disabled={page === 1}
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                        >
                            Trước
                        </button>
                        <span style={{ display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: 13 }}>
                            Trang {page} / {pagination.totalPages}
                        </span>
                        <button
                            className="btn btn-secondary btn-sm"
                            disabled={page === pagination.totalPages}
                            onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                        >
                            Sau
                        </button>
                    </div>
                )}
            </div>

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
                                    {modalStep === 'upload' ? 'Import lô tài khoản từ Excel' : 'Xác nhận thông tin lô'}
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
                                                    <label className="form-label">Tên MCC Account *</label>
                                                    <input
                                                        type="text"
                                                        className={`form-input ${!editedMccAccountName ? 'border-danger' : ''}`}
                                                        style={!editedMccAccountName ? { borderColor: 'var(--danger)' } : {}}
                                                        value={editedMccAccountName}
                                                        onChange={(e) => setEditedMccAccountName(e.target.value)}
                                                        placeholder="Nhập tên MCC Account"
                                                    />
                                                </div>
                                                <div className="form-group" style={{ margin: 0 }}>
                                                    <label className="form-label">ID MCC Account *</label>
                                                    <input
                                                        type="text"
                                                        className={`form-input ${!editedMccAccountId ? 'border-danger' : ''}`}
                                                        style={!editedMccAccountId ? { borderColor: 'var(--danger)' } : {}}
                                                        value={editedMccAccountId}
                                                        onChange={(e) => setEditedMccAccountId(e.target.value)}
                                                        placeholder="xxx-xxx-xxxx"
                                                    />
                                                </div>
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                                                <div className="form-group" style={{ margin: 0 }}>
                                                    <label className="form-label">Múi giờ *</label>
                                                    <select
                                                        className={`form-select ${!editedTimezone ? 'border-danger' : ''}`}
                                                        style={!editedTimezone ? { borderColor: 'var(--danger)' } : {}}
                                                        value={editedTimezone}
                                                        onChange={(e) => setEditedTimezone(e.target.value)}
                                                    >
                                                        <option value="">-- Múi giờ --</option>
                                                        {TIMEZONES.map(tz => (
                                                            <option key={tz} value={tz}>{tz}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="form-group" style={{ margin: 0 }}>
                                                    <label className="form-label">Năm tạo (Year) *</label>
                                                    <input
                                                        type="number"
                                                        className={`form-input ${!editedYear ? 'border-danger' : ''}`}
                                                        style={!editedYear ? { borderColor: 'var(--danger)' } : {}}
                                                        value={editedYear}
                                                        onChange={(e) => setEditedYear(e.target.value === '' ? '' : parseInt(e.target.value))}
                                                        placeholder="2025"
                                                    />
                                                </div>
                                                <div className="form-group" style={{ margin: 0 }}>
                                                    <label className="form-label">Readiness (0-10) *</label>
                                                    <input
                                                        type="number"
                                                        className={`form-input ${editedReadiness === undefined ? 'border-danger' : ''}`}
                                                        style={editedReadiness === undefined ? { borderColor: 'var(--danger)' } : {}}
                                                        min="0"
                                                        max="10"
                                                        value={editedReadiness}
                                                        onChange={(e) => setEditedReadiness(parseInt(e.target.value) || 0)}
                                                    />
                                                </div>
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
                                                    {parsedData.accounts.map((account, index) => (
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
                                                                        Đã tồn tại (sẽ cập nhật)
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
                                            disabled={!editedMccAccountName || !editedMccAccountId || !editedTimezone || !editedYear || editedReadiness === undefined || createMutation.isPending}
                                            onClick={handleCreate}
                                        >
                                            {createMutation.isPending ? (
                                                'Đang tạo...'
                                            ) : (
                                                <>
                                                    <CheckCircle size={18} />
                                                    Xác nhận tạo lô ({parsedData?.accounts.length} tài khoản)
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

            {/* Edit Modal */}
            {
                showEditModal && selectedBatch && (
                    <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
                        <div className="modal" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3 className="modal-title">Cập nhật Lô tài khoản</h3>
                                <button className="modal-close" onClick={() => setShowEditModal(false)}>×</button>
                            </div>
                            <form onSubmit={handleUpdate}>
                                <div className="modal-body">
                                    <div className="form-group">
                                        <label className="form-label">Tên MCC Account *</label>
                                        <input
                                            name="mccAccountName"
                                            type="text"
                                            className="form-input"
                                            defaultValue={selectedBatch.mccAccountName}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">ID MCC Account</label>
                                        <input
                                            name="mccAccountId"
                                            type="text"
                                            className="form-input"
                                            defaultValue={selectedBatch.mccAccountId || ''}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Đối tác</label>
                                        <select
                                            name="partnerId"
                                            className="form-select"
                                            defaultValue={selectedBatch.partner?.id || selectedBatch.partnerId || ''}
                                        >
                                            <option value="">-- Chọn đối tác --</option>
                                            {partners.map((p: Partner) => (
                                                <option key={p.id} value={p.id}>{p.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-grid">
                                        <div className="form-group">
                                            <label className="form-label">Múi giờ</label>
                                            <select name="timezone" className="form-select" defaultValue={selectedBatch.timezone || ''}>
                                                <option value="">-- Chọn múi giờ --</option>
                                                {TIMEZONES.map(tz => (
                                                    <option key={tz} value={tz}>{tz}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Năm tạo (Year)</label>
                                            <input
                                                name="year"
                                                type="number"
                                                className="form-input"
                                                defaultValue={selectedBatch.year || 2025}
                                            />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Mức độ sẵn sàng (Readiness: 0-10)</label>
                                        <input
                                            name="readiness"
                                            type="range"
                                            min="0"
                                            max="10"
                                            step="1"
                                            className="form-input"
                                            style={{ padding: 0, height: 'auto' }}
                                            defaultValue={selectedBatch.readiness || 0}
                                            onChange={(e) => {
                                                const val = e.target.nextElementSibling;
                                                if (val) val.textContent = e.target.value;
                                            }}
                                        />
                                        <div style={{ textAlign: 'center', fontWeight: 600 }}>{selectedBatch.readiness || 0}</div>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Trạng thái</label>
                                        <select
                                            name="status"
                                            className="form-select"
                                            defaultValue={selectedBatch.status}
                                        >
                                            <option value="ACTIVE">Hoạt động (Active)</option>
                                            <option value="INACTIVE">Không hoạt động (Inactive)</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Ghi chú</label>
                                        <textarea
                                            name="notes"
                                            className="form-input"
                                            rows={3}
                                            defaultValue={selectedBatch.notes || ''}
                                        />
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Hủy</button>
                                    <button type="submit" className="btn btn-primary" disabled={updateMutation.isPending}>
                                        {updateMutation.isPending ? 'Đang cập nhật...' : 'Cập nhật'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* Delete Confirmation Modal */}
            {
                deleteId && (
                    <div className="modal-overlay" onClick={() => setDeleteId(null)}>
                        <div className="modal" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3 className="modal-title">Xác nhận xóa</h3>
                                <button className="modal-close" onClick={() => setDeleteId(null)}>×</button>
                            </div>
                            <div className="modal-body">
                                <p>Bạn có chắc chắn muốn xóa Lô tài khoản này không? Hành động này không thể hoàn tác.</p>
                                <p style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                                    * Chỉ có thể xóa Lô không có tài khoản nào.
                                </p>
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

            {/* Toast */}
            {
                toast && (
                    <div className={`toast toast-${toast.type}`}>
                        {toast.type === 'success' ? '✓' : '✕'} {toast.message}
                    </div>
                )
            }
            {/* Bulk Edit Modal */}
            {showBulkEditModal && (
                <div className="modal-overlay" onClick={() => setShowBulkEditModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Cập nhật hàng loạt ({selectedIds.size} lô)</h3>
                            <button className="modal-close" onClick={() => setShowBulkEditModal(false)}>×</button>
                        </div>
                        <form onSubmit={handleBulkSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Trạng thái mới (để trống nếu không đổi)</label>
                                    <select
                                        className="form-select"
                                        value={bulkStatus}
                                        onChange={e => setBulkStatus(e.target.value)}
                                    >
                                        <option value="">-- Giữ nguyên --</option>
                                        <option value="ACTIVE">Hoạt động (Active)</option>
                                        <option value="INACTIVE">Không hoạt động (Inactive)</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Độ sẵn sàng (Readiness) (để trống nếu không đổi)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="10"
                                        className="form-input"
                                        placeholder="Để trống để giữ nguyên"
                                        value={bulkReadiness === undefined ? '' : bulkReadiness}
                                        onChange={e => {
                                            const val = e.target.value;
                                            setBulkReadiness(val === '' ? undefined : Number(val));
                                        }}
                                    />
                                    <small style={{ color: 'var(--text-muted)' }}>Nhập số từ 0 - 10</small>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowBulkEditModal(false)}>Hủy</button>
                                <button type="submit" className="btn btn-primary" disabled={bulkUpdateMutation.isPending}>
                                    {bulkUpdateMutation.isPending ? 'Đang cập nhật...' : 'Cập nhật'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div >
    );
}
