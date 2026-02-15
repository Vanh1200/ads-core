import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Search, Filter, X, ChevronUp, ChevronDown, Link2, Plus, Clock, User, ArrowRight, UserPlus, Trash2, Edit2, Copy } from 'lucide-react';
import { useAuthStore, canManageBatches, canLinkMI, canAssignMC, canUpdateSpending } from '../store/authStore';
import ConfirmModal from '../components/ConfirmModal';
import Dropdown, { type DropdownItem } from '../components/Dropdown';
import SearchDropdown from '../components/SearchDropdown';
import { accountsApi, batchesApi, invoiceMCCsApi, activityLogsApi, customersApi, partnersApi } from '../api/client';

interface Account {
    id: string;
    googleAccountId: string;
    accountName: string;
    status: string;
    currency: string;
    mccAccountId: string | null;
    batch: { id: string; mccAccountName: string; mccAccountId?: string | null } | null;
    currentMi: { id: string; name: string; mccInvoiceId?: string | null } | null;
    currentMc: { id: string; name: string } | null;
    createdAt: string;
    totalSpending: number;
    rangeSpending?: number;
}

interface Batch {
    id: string;
    mccAccountName: string;
    mccAccountId: string | null;
}

interface InvoiceMCC {
    id: string;
    name: string;
    mccAccountId: string | null;
    mccInvoiceId: string | null;
    status: string;
}

type SortField = 'googleAccountId' | 'accountName' | 'status' | 'currency' | 'batch' | 'currentMi' | 'currentMc' | 'totalSpending';
type SortOrder = 'asc' | 'desc';

export default function Accounts() {
    const queryClient = useQueryClient();
    const { user } = useAuthStore();
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();

    const [search, setSearch] = useState(searchParams.get('search') || '');
    const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') || '');
    const [idsFilter, setIdsFilter] = useState<string>(searchParams.get('ids') ? searchParams.get('ids')!.replace(/,/g, '\n') : '');

    // Priority: URL Params (Strict) > Saved Filters > Default
    const [batchId, setBatchId] = useState<string>(searchParams.get('batchId') || '');
    const [miId, setMiId] = useState<string>(searchParams.get('miId') || '');
    const [mcId, setMcId] = useState<string>(searchParams.get('mcId') || '');

    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null);

    // Sorting
    const [sortField, setSortField] = useState<SortField>('googleAccountId');
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
    const [spendingDays] = useState(7);



    // Reset page to 1 when filters change (skip initial mount)
    const isFirstRun = useRef(true);
    useEffect(() => {
        if (isFirstRun.current) {
            isFirstRun.current = false;
            return;
        }
        setPage(1);
        setSelectionAnchor(null);
    }, [search, statusFilter, idsFilter, batchId, miId, mcId, limit, sortField, sortOrder]);

    // State
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [showStatusSelector, setShowStatusSelector] = useState(false);
    const [targetStatus, setTargetStatus] = useState<string>('ACTIVE');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // Modals
    const [showMiModal, setShowMiModal] = useState(false);
    const [miSearch, setMiSearch] = useState('');
    const [showCreateMi, setShowCreateMi] = useState(false);
    const [newMiName, setNewMiName] = useState('');
    const [newMiInvoiceId, setNewMiInvoiceId] = useState('');
    const [newMiPartnerId, setNewMiPartnerId] = useState('');

    const [showMcModal, setShowMcModal] = useState(false);
    const [mcSearch, setMcSearch] = useState('');

    const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

    // Confirmation Modals
    const [showConfirmMiModal, setShowConfirmMiModal] = useState(false);
    const [pendingMiAction, setPendingMiAction] = useState<{ miId: string; accountIds: string[] } | null>(null);
    const [confirmAccounts, setConfirmAccounts] = useState<Account[]>([]);

    const [showConfirmMcModal, setShowConfirmMcModal] = useState(false);
    const [pendingMcAction, setPendingMcAction] = useState<{ customerId: string; accountIds: string[] } | null>(null);

    const [confirmBulkStatus, setConfirmBulkStatus] = useState<{ isOpen: boolean; status: string }>({ isOpen: false, status: '' });
    const [confirmBulkUnlinkMi, setConfirmBulkUnlinkMi] = useState(false);
    const [confirmBulkUnassignMc, setConfirmBulkUnassignMc] = useState(false);

    // Read filters from URL on mount and handle navigation updates
    useEffect(() => {
        // Strict sync: If URL changes, update state to match exactly.
        // This ensures that navigating (e.g. deep links, back button) correctly resets filters not in the URL.
        const urlSearch = searchParams.get('search') || '';
        const urlStatus = searchParams.get('status') || '';
        const urlBatchId = searchParams.get('batchId') || '';
        const urlMiId = searchParams.get('miId') || '';
        const urlMcId = searchParams.get('mcId') || '';
        const urlIds = searchParams.get('ids');

        setSearch(urlSearch);
        setStatusFilter(urlStatus);
        setBatchId(urlBatchId);
        setMiId(urlMiId);
        setMcId(urlMcId);

        if (urlIds) {
            setIdsFilter(urlIds.replace(/,/g, '\n'));
        } else {
            // Only clear idsFilter if it wasn't the driver of this change? 
            // Actually, strictly syncing implies clearing it if not in URLUrl.
            // But careful with infinite loops if we are currently editing it?
            // No, editing updates state -> updates URL.
            // Navigation updates URL -> updates state.
            setIdsFilter('');
        }
    }, [searchParams]);

    useEffect(() => {
        const handleReset = () => {
            resetFilters();
            // setSearchQuery(''); // Removed as searchQuery is no longer a state in Accounts
        };
        window.addEventListener('reset-accounts-filters', handleReset);
        return () => window.removeEventListener('reset-accounts-filters', handleReset);
    }, []);

    // Update URL params when search/status change
    useEffect(() => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            if (search) next.set('search', search); else next.delete('search');
            if (statusFilter) next.set('status', statusFilter); else next.delete('status');
            if (idsFilter) next.set('ids', idsFilter); else next.delete('ids');
            if (batchId) next.set('batchId', batchId); else next.delete('batchId');
            if (miId) next.set('miId', miId); else next.delete('miId');
            if (mcId) next.set('mcId', mcId); else next.delete('mcId');
            return next;
        }, { replace: true });
    }, [search, statusFilter, idsFilter, batchId, miId, mcId, setSearchParams]);

    // ... (queries)

    // Fetch accounts
    const { data, isLoading } = useQuery({
        queryKey: ['accounts', search, statusFilter, idsFilter, batchId, miId, mcId, page, limit, sortField, sortOrder, spendingDays],
        queryFn: () => accountsApi.list({
            search,
            status: statusFilter || undefined,
            ids: idsFilter ? idsFilter.split(/[\n,]+/).map(s => s.trim()).filter(Boolean) : undefined,
            batchId: batchId || undefined,
            miId: miId || undefined,
            mcId: mcId || undefined,
            page,
            limit,
            sortBy: sortField,
            sortOrder: sortOrder,
            spendingDays,
        }),
    });

    // Fetch partners list
    const { data: partnersData } = useQuery({
        queryKey: ['partners-list-simple'],
        queryFn: () => partnersApi.list({ limit: 100 }),
    });
    const partners = (partnersData?.data?.data || []) as any[];

    // Fetch MI list for filters
    const { data: miListData } = useQuery({
        queryKey: ['invoice-mccs-list'],
        queryFn: () => invoiceMCCsApi.list({ limit: 1000 }),
    });
    const miList = (miListData?.data?.data || []) as InvoiceMCC[];

    const createMiMutation = useMutation({
        mutationFn: (data: { name: string; mccInvoiceId: string; partnerId?: string }) => invoiceMCCsApi.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['invoice-mccs'] });
            setShowCreateMi(false);
            setNewMiName('');
            setNewMiInvoiceId('');
            setNewMiPartnerId('');
        },
    });

    // Link accounts to MI mutation
    const linkMutation = useMutation({
        mutationFn: ({ miId, accountIds }: { miId: string; accountIds: string[] }) =>
            invoiceMCCsApi.linkAccounts(miId, accountIds),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
            const count = variables.accountIds.length;
            setToast({ message: `Đã liên kết thành công ${count} tài khoản với MI!`, type: 'success' });
            setTimeout(() => setToast(null), 3000);
            setSelectedIds(new Set());
            setShowMiModal(false);
        },
        onError: () => {
            setToast({ message: 'Có lỗi xảy ra khi liên kết!', type: 'error' });
            setTimeout(() => setToast(null), 3000);
        },
    });

    // Fetch customer list for filters
    const { data: customerListData } = useQuery({
        queryKey: ['customers-list'],
        queryFn: () => customersApi.list({ limit: 1000 }),
    });
    const customerList = customerListData?.data?.data || [];

    // Fetch batches for filter badge
    const { data: batchesData } = useQuery({
        queryKey: ['batches'],
        queryFn: () => batchesApi.list(),
    });
    const batches: Batch[] = Array.isArray(batchesData?.data?.data) ? batchesData?.data?.data : [];

    // Derived state for badges removed as unnecessary
    // const currentBatch = batches.find((b: Batch) => b.id === batchId) || batchDetail?.data;
    // const currentMi = miList.find((mi: InvoiceMCC) => mi.id === miId) || miDetail?.data;
    // const currentMc = customerList.find((mc: any) => mc.id === mcId) || mcDetail?.data;

    // Bulk Action Mutations
    const bulkUpdateStatusMutation = useMutation({
        mutationFn: ({ accountIds, status }: { accountIds: string[], status: string }) =>
            accountsApi.bulkUpdateStatus(accountIds, status),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
            setToast({ message: `Đã cập nhật trạng thái ${data.data.updatedAccountIds.length} tài khoản thành công!`, type: 'success' });
            setTimeout(() => setToast(null), 3000);
            setSelectedIds(new Set());
        },
        onError: () => {
            setToast({ message: 'Có lỗi xảy ra khi cập nhật trạng thái!', type: 'error' });
            setTimeout(() => setToast(null), 3000);
        }
    });

    const bulkUnlinkMiMutation = useMutation({
        mutationFn: (accountIds: string[]) => accountsApi.bulkUnlinkMi(accountIds),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
            setToast({ message: `Đã hủy liên kết MI cho ${data.data.unlinkedAccountIds.length} tài khoản thành công!`, type: 'success' });
            setTimeout(() => setToast(null), 3000);
            setSelectedIds(new Set());
        },
        onError: () => {
            setToast({ message: 'Có lỗi xảy ra khi hủy liên kết MI!', type: 'error' });
            setTimeout(() => setToast(null), 3000);
        }
    });

    const bulkUnassignMcMutation = useMutation({
        mutationFn: (accountIds: string[]) => accountsApi.bulkUnassignMc(accountIds),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
            setToast({ message: `Đã hủy giao khách cho ${data.data.unassignedAccountIds.length} tài khoản thành công!`, type: 'success' });
            setTimeout(() => setToast(null), 3000);
            setSelectedIds(new Set());
        },
        onError: () => {
            setToast({ message: 'Có lỗi xảy ra khi hủy giao khách!', type: 'error' });
            setTimeout(() => setToast(null), 3000);
        }
    });

    // Assign accounts to customer mutation
    const assignMutation = useMutation({
        mutationFn: ({ customerId, accountIds }: { customerId: string; accountIds: string[] }) =>
            customersApi.assignAccounts(customerId, accountIds),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
            queryClient.invalidateQueries({ queryKey: ['customers'] });
            const count = variables.accountIds.length;
            setToast({ message: `Đã giao thành công ${count} tài khoản cho khách hàng!`, type: 'success' });
            setTimeout(() => setToast(null), 3000);
            setSelectedIds(new Set());
            setShowMcModal(false);
        },
        onError: () => {
            setToast({ message: 'Có lỗi xảy ra khi giao tài khoản!', type: 'error' });
            setTimeout(() => setToast(null), 3000);
        },
    });

    // Fetch account detail when selected
    const { data: accountDetailData } = useQuery({
        queryKey: ['account-detail', selectedAccountId],
        queryFn: () => accountsApi.get(selectedAccountId!),
        enabled: !!selectedAccountId,
    });
    const accountDetail = accountDetailData?.data;

    // Fetch activity logs for selected account
    const { data: accountLogsData } = useQuery({
        queryKey: ['account-logs', selectedAccountId],
        queryFn: () => activityLogsApi.getEntityLogs('Account', selectedAccountId!),
        enabled: !!selectedAccountId,
    });
    const accountLogs = accountLogsData?.data || [];

    const accounts = (data?.data?.data || []) as Account[];
    const pagination = data?.data?.pagination || { total: 0, totalPages: 1 };





    const resetFilters = () => {
        setSearch('');
        setStatusFilter('');
        setIdsFilter('');
        setBatchId('');
        setMiId('');
        setMcId('');
        setPage(1);
        setPage(1);
    };

    // Sorting
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

    // Handle Copy IDs (Current Page Only)
    const handleCopyIds = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            if (accounts && accounts.length > 0) {
                const idList = accounts.map(a => a.googleAccountId).join('\n');
                await navigator.clipboard.writeText(idList);
                setToast({ message: `Đã sao chép ${accounts.length} ID trên trang này vào clipboard`, type: 'success' });
                setTimeout(() => setToast(null), 3000);
            } else {
                setToast({ message: 'Không có tài khoản nào trên trang này để sao chép', type: 'error' });
                setTimeout(() => setToast(null), 3000);
            }
        } catch (error) {
            console.error('Copy IDs error:', error);
            setToast({ message: 'Lỗi khi sao chép ID', type: 'error' });
            setTimeout(() => setToast(null), 3000);
        }
    };

    // Unified Selection Logic
    const [isAllSelected, setIsAllSelected] = useState(false); // Global flag
    const [isSelectingAll, setIsSelectingAll] = useState(false); // Loading state for global select

    // Reset global selection when filters change
    useEffect(() => {
        setIsAllSelected(false);
        setSelectedIds(new Set());
    }, [search, statusFilter, idsFilter, batchId, miId, mcId]);

    const allSelected = (accounts.length > 0 && accounts.every(a => selectedIds.has(a.id)));
    const someSelected = (accounts.length > 0 && accounts.some(a => selectedIds.has(a.id)));

    const toggleSelectAll = () => {
        if (allSelected) {
            // Deselect current page
            const newSet = new Set(selectedIds);
            accounts.forEach(a => newSet.delete(a.id));
            setSelectedIds(newSet);
            setIsAllSelected(false);
        } else {
            // Select current page
            const newSet = new Set(selectedIds);
            accounts.forEach(a => newSet.add(a.id));
            setSelectedIds(newSet);
        }
    };

    const handleSelectAllGlobal = async () => {
        setIsSelectingAll(true);
        try {
            const params = {
                search: search || undefined,
                status: statusFilter || undefined,
                ids: idsFilter ? idsFilter.split('\n').map(l => l.trim()).filter(Boolean) : undefined,
                batchId: batchId || undefined,
                miId: miId || undefined,
                mcId: mcId || undefined,
                page: 1,
                limit: 10000, // Fetch all (up to 10k)
            };

            const res = await accountsApi.list(params);
            const allAccounts = res.data.data;
            const allIds = allAccounts.map((a: any) => a.id);

            setSelectedIds(new Set(allIds));
            setIsAllSelected(true);
            setToast({ message: `Đã chọn tất cả ${allIds.length} tài khoản`, type: 'success' });
            setTimeout(() => setToast(null), 3000);
        } catch (error) {
            console.error(error);
            setToast({ message: 'Không thể chọn tất cả tài khoản. Vui lòng thử lại.', type: 'error' });
            setTimeout(() => setToast(null), 3000);
        } finally {
            setIsSelectingAll(false);
        }
    };

    const toggleSelect = (id: string, index: number, event?: any) => {
        // Detect shift key from either MouseEvent or original event
        const isShift = event?.shiftKey || (event?.nativeEvent && (event.nativeEvent as any).shiftKey);

        setSelectedIds(prev => {
            const next = new Set(prev);

            // If shift is held and we have an anchor, select the range from anchor to current
            if (isShift && selectionAnchor !== null && selectionAnchor !== index) {
                const start = Math.min(selectionAnchor, index);
                const end = Math.max(selectionAnchor, index);

                // If the target item is NOT yet selected, we want to SELECT the range.
                // If it IS selected, we want to DESELECT the range.
                const shouldSelect = !prev.has(id);

                for (let i = start; i <= end; i++) {
                    const accId = accounts[i]?.id;
                    if (accId) {
                        if (shouldSelect) next.add(accId);
                        else next.delete(accId);
                    }
                }
            } else {
                // Single toggle
                if (next.has(id)) next.delete(id);
                else next.add(id);

                // Update anchor only on non-shift clicks
                setSelectionAnchor(index);
            }
            return next;
        });
    };

    const handleLinkToMi = (miId: string) => {
        // Get selected account objects
        const selectedAccountsList = accounts.filter(a => selectedIds.has(a.id));

        // 1. Check for redundancy (already linked to THIS miId)
        const alreadyLinked = selectedAccountsList.filter(a => a.currentMi?.id === miId);
        if (alreadyLinked.length > 0) {
            setToast({
                message: `Lỗi: ${alreadyLinked.length} tài khoản đã thuộc về MI này rồi(${alreadyLinked.map(a => a.googleAccountId).join(', ')}).Vui lòng bỏ chọn.`,
                type: 'error'
            });
            setTimeout(() => setToast(null), 5000);
            return;
        }

        // 2. Check for changes (linked to DIFFERENT miId)
        const changingAccounts = selectedAccountsList.filter(a => a.currentMi && a.currentMi.id !== miId);

        if (changingAccounts.length > 0) {
            setConfirmAccounts(changingAccounts);
            setPendingMiAction({ miId, accountIds: Array.from(selectedIds) });
            setShowConfirmMiModal(true);
            // Close selection modal
            setShowMiModal(false);
            return;
        }

        // 3. Safe to proceed
        linkMutation.mutate({ miId, accountIds: Array.from(selectedIds) });
    };

    const handleAssignToMc = (customerId: string) => {
        // Get selected account objects
        const selectedAccountsList = accounts.filter(a => selectedIds.has(a.id));

        // 1. Check for redundancy (already assigned to THIS customerId)
        const alreadyAssigned = selectedAccountsList.filter(a => a.currentMc?.id === customerId);
        if (alreadyAssigned.length > 0) {
            setToast({
                message: `Lỗi: ${alreadyAssigned.length} tài khoản đã được giao cho khách hàng này rồi(${alreadyAssigned.map(a => a.googleAccountId).join(', ')}).Vui lòng bỏ chọn.`,
                type: 'error'
            });
            setTimeout(() => setToast(null), 5000);
            return;
        }

        // 2. Check for changes (assigned to DIFFERENT customerId)
        const changingAccounts = selectedAccountsList.filter(a => a.currentMc && a.currentMc.id !== customerId);

        if (changingAccounts.length > 0) {
            setConfirmAccounts(changingAccounts);
            setPendingMcAction({ customerId, accountIds: Array.from(selectedIds) });
            setShowConfirmMcModal(true);
            // Close selection modal
            setShowMcModal(false);
            return;
        }

        // 3. Safe to proceed
        assignMutation.mutate({ customerId, accountIds: Array.from(selectedIds) });
    };

    const handleCreateMi = () => {
        if (!newMiName.trim() || !newMiInvoiceId.trim()) return;
        createMiMutation.mutate({
            name: newMiName.trim(),
            mccInvoiceId: newMiInvoiceId.trim(),
            partnerId: newMiPartnerId || undefined
        });
    };

    const statusLabels: Record<string, { label: string; class: string; color: string }> = {
        ACTIVE: {
            label: 'Hoạt động',
            class: 'success',
            color: 'var(--secondary)'
        },
        INACTIVE: {
            label: 'Không hoạt động',
            class: 'danger',
            color: 'var(--danger)'
        },
    };

    // Unified Search Logic
    const [isSearchOpen, setIsSearchOpen] = useState(false);


    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Tài khoản</h1>
                    <p className="page-subtitle">Danh sách tất cả tài khoản Google Ads</p>
                </div>
            </div>

            {/* Active Filters removed as per request */}

            {/* Selection Action Bar */}
            {selectedIds.size > 0 && (
                <div style={{
                    marginBottom: 16,
                    padding: '12px 16px',
                    background: 'var(--bg-secondary)',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    border: '1px solid var(--border)',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontWeight: 500 }}>
                            Đã chọn <strong style={{ color: 'var(--primary)' }}>{selectedIds.size}</strong> tài khoản
                        </span>
                        {/* Global Select Option */}
                        {!isAllSelected && selectedIds.size >= accounts.length && pagination.total > selectedIds.size && (
                            <button
                                onClick={handleSelectAllGlobal}
                                disabled={isSelectingAll}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#096dd9',
                                    padding: 0,
                                    fontSize: 14,
                                    cursor: 'pointer',
                                    fontWeight: 500,
                                    textDecoration: 'underline',
                                    marginLeft: 8
                                }}
                            >
                                {isSelectingAll ? 'Đang chọn...' : `(Chọn tất cả ${pagination.total} tài khoản theo bộ lọc)`}
                            </button>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {canLinkMI(user?.role || 'VIEWER') && (
                            <button
                                className="btn btn-primary"
                                onClick={() => setShowMiModal(true)}
                            >
                                <Link2 size={16} />
                                Link MI
                            </button>
                        )}
                        {canAssignMC(user?.role || 'VIEWER') && (
                            <button
                                className="btn btn-primary"
                                style={{ background: '#10b981', borderColor: '#10b981' }}
                                onClick={() => setShowMcModal(true)}
                            >
                                <UserPlus size={16} />
                                Giao MC
                            </button>
                        )}

                        {/* More Actions Dropdown */}
                        {(() => {
                            const role = user?.role || 'VIEWER';
                            const canStatus = canManageBatches(role) || canUpdateSpending(role); // Allow Admin/Buyer/Updater
                            const canUnlink = canLinkMI(role);
                            const canUnassign = canAssignMC(role);

                            if (!canStatus && !canUnlink && !canUnassign) return null;

                            const items: DropdownItem[] = [];

                            if (canStatus) {
                                items.push(
                                    { type: 'header', key: 'status-header', label: 'Trạng thái' },
                                    {
                                        key: 'update-status',
                                        label: 'Thay đổi trạng thái',
                                        icon: <Edit2 size={14} />,
                                        onClick: () => setShowStatusSelector(true)
                                    }
                                );
                            }

                            if ((canStatus && (canUnlink || canUnassign))) {
                                items.push({ type: 'divider', key: 'divider-1', label: '' });
                            }

                            if (canUnlink || canUnassign) {
                                items.push({ type: 'header', key: 'manage-header', label: 'Quản lý' });
                            }

                            if (canUnlink) {
                                items.push({
                                    key: 'unlink-mi',
                                    label: 'Xóa MI (Hủy liên kết)',
                                    icon: <Trash2 size={14} />,
                                    danger: true,
                                    onClick: () => setConfirmBulkUnlinkMi(true)
                                });
                            }

                            if (canUnassign) {
                                items.push({
                                    key: 'unassign-mc',
                                    label: 'Xóa MC (Hủy giao)',
                                    icon: <Trash2 size={14} />,
                                    danger: true,
                                    onClick: () => setConfirmBulkUnassignMc(true)
                                });
                            }

                            return (
                                <Dropdown
                                    trigger={
                                        <button
                                            className="btn btn-secondary"
                                            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                                        >
                                            Thao tác khác
                                            <ChevronDown size={14} />
                                        </button>
                                    }
                                    items={items}
                                />
                            );
                        })()}

                        <button
                            className="btn btn-secondary"
                            onClick={() => {
                                setSelectedIds(new Set());
                                setIsAllSelected(false);
                            }}
                        >
                            Bỏ chọn
                        </button>
                    </div>
                </div>
            )}

            <div className="card" style={{ overflow: 'visible' }}>
                <div className="card-header" style={{ gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-start', overflow: 'visible' }}>
                    <Filter size={18} style={{ color: 'var(--text-muted)' }} />
                    <div style={{ position: 'relative' }}>
                        <button
                            className={`btn ${search || idsFilter || isSearchOpen ? 'btn-primary' : 'btn-secondary'} `}
                            onClick={() => setIsSearchOpen(true)}
                            style={{ gap: 8 }}
                        >
                            <Search size={16} />
                            {search ? `Tìm: ${search} ` : idsFilter ? `Lọc theo ID(${idsFilter.split(/[\n,]+/).length})` : 'Tìm kiếm'}
                            <ChevronDown size={14} />
                        </button>

                        <SearchDropdown
                            isOpen={isSearchOpen}
                            onClose={() => setIsSearchOpen(false)}
                            onApply={(value) => {
                                // If it looks like a list of IDs, set it to idsFilter
                                if (value.includes('\n') || value.includes(',') || /^\d+$/.test(value.trim())) {
                                    setIdsFilter(value.trim());
                                    setSearch('');
                                } else {
                                    setSearch(value.trim());
                                    setIdsFilter('');
                                }
                                setIsSearchOpen(false);
                                setPage(1);
                            }}
                            onClear={() => {
                                setSearch('');
                                setIdsFilter('');
                                setIsSearchOpen(false);
                                setPage(1);
                            }}
                            initialValue={search || idsFilter}
                            placeholder="Nhập tên tài khoản, ID đơn lẻ, hoặc dán danh sách ID (mỗi dòng một ID)..."
                        />
                    </div>

                    {/* Spending Days Filter */}


                    <Dropdown
                        trigger={
                            <button className={`btn ${statusFilter ? 'btn-primary' : 'btn-secondary'} `} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {statusFilter ? statusLabels[statusFilter]?.label : 'Tất cả trạng thái'}
                                <ChevronDown size={14} />
                            </button>
                        }
                        items={[
                            { key: 'all', label: 'Tất cả trạng thái', onClick: () => setStatusFilter('') },
                            { type: 'divider', key: 'd1', label: '' },
                            {
                                key: 'ACTIVE',
                                label: 'Hoạt động',
                                icon: <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />,
                                onClick: () => setStatusFilter('ACTIVE')
                            },
                            {
                                key: 'INACTIVE',
                                label: 'Không hoạt động',
                                icon: <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />,
                                onClick: () => setStatusFilter('INACTIVE')
                            }
                        ]}
                    />

                    <Dropdown
                        trigger={
                            <button className={`btn ${batchId ? 'btn-primary' : 'btn-secondary'} `} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {batchId ? (batches.find(b => b.id === batchId)?.mccAccountName || 'Lô: Đang chọn') : 'Tất cả Lô (MA)'}
                                <ChevronDown size={14} />
                            </button>
                        }
                        width={260}
                        searchable={true}
                        searchPlaceholder="Tìm kiếm Lô..."
                        items={[
                            { key: 'all-ma', label: 'Tất cả Lô (MA)', onClick: () => setBatchId('') },
                            { type: 'divider', key: 'd-ma', label: '' },
                            ...batches.map(b => ({
                                key: b.id,
                                label: (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                        <span>{b.mccAccountName}</span>
                                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.mccAccountId || b.id}</span>
                                    </div>
                                ),
                                searchKeywords: `${b.mccAccountName} ${b.mccAccountId || ''} ${b.id} `,
                                onClick: () => setBatchId(b.id)
                            }))
                        ]}
                    />

                    <Dropdown
                        trigger={
                            <button className={`btn ${miId ? 'btn-primary' : 'btn-secondary'} `} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {miId ? (miList.find(m => m.id === miId)?.name || 'MI: Đang chọn') : 'Tất cả MCC (MI)'}
                                <ChevronDown size={14} />
                            </button>
                        }
                        width={280}
                        searchable={true}
                        searchPlaceholder="Tìm kiếm MCC..."
                        items={[
                            { key: 'all-mi', label: 'Tất cả MCC (MI)', onClick: () => setMiId('') },
                            { type: 'divider', key: 'd-mi', label: '' },
                            ...miList.map(m => ({
                                key: m.id,
                                label: (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                        <span>{m.name}</span>
                                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.mccInvoiceId || m.mccAccountId || m.id}</span>
                                    </div>
                                ),
                                searchKeywords: `${m.name} ${m.mccInvoiceId || ''} ${m.mccAccountId || ''} ${m.id} `,
                                onClick: () => setMiId(m.id)
                            }))
                        ]}
                    />

                    <Dropdown
                        trigger={
                            <button className={`btn ${mcId ? 'btn-primary' : 'btn-secondary'} `} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {mcId ? (customerList.find((c: any) => c.id === mcId)?.name || 'MC: Đang chọn') : 'Tất cả Khách (MC)'}
                                <ChevronDown size={14} />
                            </button>
                        }
                        width={280}
                        searchable={true}
                        searchPlaceholder="Tìm kiếm Khách..."
                        items={[
                            { key: 'all-mc', label: 'Tất cả Khách (MC)', onClick: () => setMcId('') },
                            { type: 'divider', key: 'd-mc', label: '' },
                            ...customerList.map((c: any) => ({
                                key: c.id,
                                label: (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                        <span>{c.name}</span>
                                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.id}</span>
                                    </div>
                                ),
                                searchKeywords: `${c.name} ${c.id} `,
                                onClick: () => setMcId(c.id)
                            }))
                        ]}
                    />

                    {/* Spending Days Filter */}
                    <Dropdown


                        {(search || statusFilter || idsFilter || batchId || miId || mcId) && (
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
                    {/* Global Selection Banner Removed - Moved to Action Bar */}
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th style={{ width: '40px' }}>
                                    <input
                                        type="checkbox"
                                        checked={allSelected}
                                        ref={(el) => {
                                            if (el) el.indeterminate = someSelected && !allSelected;
                                        }}
                                        onChange={toggleSelectAll}
                                        style={{ cursor: 'pointer' }}
                                    />
                                </th>
                                <th
                                    onClick={() => handleSort('googleAccountId')}
                                    style={{ cursor: 'pointer', userSelect: 'none', position: 'relative' }}
                                    className="group"
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        ID Google Ads <SortIcon field="googleAccountId" />
                                        <div
                                            className="copy-btn"
                                            onClick={handleCopyIds}
                                            title="Sao chép ID trên trang này"
                                            style={{
                                                marginLeft: 4,
                                                padding: 4,
                                                borderRadius: 4,
                                                background: 'var(--bg-secondary)',
                                                border: '1px solid var(--border)',
                                                display: 'none', // Shown on hover via CSS in global or inline
                                            }}
                                        >
                                            <Copy size={12} />
                                        </div>
                                        <style dangerouslySetInnerHTML={{
                                            __html: `
th: hover.copy - btn { display: block!important; }
`}} />
                                    </div>
                                </th>
                                <th
                                    onClick={() => handleSort('accountName')}
                                    style={{ cursor: 'pointer', userSelect: 'none' }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        Tên tài khoản <SortIcon field="accountName" />
                                    </div>
                                </th>
                                <th
                                    onClick={() => handleSort('status')}
                                    style={{ cursor: 'pointer', userSelect: 'none' }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        Trạng thái <SortIcon field="status" />
                                    </div>
                                </th>
                                <th
                                    onClick={() => handleSort('currency')}
                                    style={{ cursor: 'pointer', userSelect: 'none' }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        Tiền tệ <SortIcon field="currency" />
                                    </div>
                                </th>
                                <th
                                    onClick={() => handleSort('totalSpending')}
                                    style={{ cursor: 'pointer', userSelect: 'none' }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        Chi phí <SortIcon field="totalSpending" />
                                    </div>
                                </th>
                                <th
                                    onClick={() => handleSort('batch')}
                                    style={{ cursor: 'pointer', userSelect: 'none' }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        Lô (MA) <SortIcon field="batch" />
                                    </div>
                                </th>
                                <th
                                    onClick={() => handleSort('currentMi')}
                                    style={{ cursor: 'pointer', userSelect: 'none' }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        Invoice MCC (MI) <SortIcon field="currentMi" />
                                    </div>
                                </th>
                                <th
                                    onClick={() => handleSort('currentMc')}
                                    style={{ cursor: 'pointer', userSelect: 'none' }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        Khách hàng (MC) <SortIcon field="currentMc" />
                                    </div>
                                </th>
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
                            ) : accounts.length > 0 ? (
                                accounts.map((account: Account, index: number) => (
                                    <tr
                                        key={account.id}
                                        onClick={() => {
                                            // Don't navigate if text is selected (user is copying)
                                            if (window.getSelection()?.toString()) return;
                                            navigate(`/accounts/${account.id}`);
                                        }}
                                        style={{
                                            background: selectedIds.has(account.id) ? 'rgba(139, 92, 246, 0.1)' : undefined,
                                            cursor: 'pointer'
                                        }}
                                        className="clickable-row"
                                    >
                                        <td onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.has(account.id)}
                                                onClick={(e) => {
                                                    // Stop row click navigation
                                                    e.stopPropagation();
                                                    // We handle the toggle logic manually
                                                    toggleSelect(account.id, index, e);
                                                }}
                                                onChange={() => { }} // Controlled input requirement
                                                style={{ cursor: 'pointer' }}
                                            />
                                        </td>
                                        <td><code>{account.googleAccountId}</code></td>
                                        <td>{account.accountName}</td>
                                        <td>
                                            <span className={`badge badge - ${statusLabels[account.status]?.class || 'info'} `} style={{ whiteSpace: 'nowrap' }}>
                                                {statusLabels[account.status]?.label || account.status}
                                            </span>
                                        </td>
                                        <td>{account.currency}</td>
                                        <td>
                                            <span style={{ fontWeight: 600, fontSize: 13, color: (account.rangeSpending || 0) > 0 ? '#059669' : 'inherit' }}>
                                                {new Intl.NumberFormat('en-US', { style: 'currency', currency: account.currency }).format(account.rangeSpending || 0)}
                                            </span>
                                        </td>

                                        <td>
                                            {account.batch ? (
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            navigate(`/batches/${account.batch!.id}`);
                                                        }}
                                                        className="hover:text-blue-400 hover:underline cursor-pointer"
                                                        style={{ color: 'var(--primary)' }}
                                                    >
                                                        {account.batch.mccAccountName}
                                                    </span>
                                                    {account.batch.mccAccountId && (
                                                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                                            {account.batch.mccAccountId}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : '-'}
                                        </td>
                                        <td>
                                            {account.currentMi ? (
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            navigate(`/invoice-mccs/${account.currentMi!.id}`);
                                                        }}
                                                        className="hover:text-blue-400 hover:underline cursor-pointer"
                                                        style={{ color: 'var(--primary)' }}
                                                    >
                                                        {account.currentMi.name}
                                                    </span>
                                                    {account.currentMi.mccInvoiceId && (
                                                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                                            {account.currentMi.mccInvoiceId}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : <span style={{ color: 'var(--warning)' }}>Chưa link</span>}
                                        </td>
                                        <td>
                                            {account.currentMc ? (
                                                <span
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        navigate(`/customers/${account.currentMc!.id}`);
                                                    }}
                                                    className="hover:text-blue-400 hover:underline cursor-pointer"
                                                    style={{ color: 'var(--primary)' }}
                                                >
                                                    {account.currentMc.name}
                                                </span>
                                            ) : <span style={{ color: 'var(--warning)' }}>Chưa giao</span>}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={10} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                                            <Search size={32} style={{ opacity: 0.3 }} />
                                            <span>Không tìm thấy tài khoản nào phù hợp</span>
                                            {(search || statusFilter || idsFilter || batchId || miId || mcId) && (
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
            </div >
            {
                pagination.total > 0 && (
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
                                <option value={200}>200</option>
                                <option value={500}>500</option>
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
                            <span style={{ color: 'var(--text-muted)', margin: '0 8px' }}>
                                Trang {page} / {pagination.totalPages}
                            </span>
                            <button
                                className="pagination-btn"
                                disabled={page >= pagination.totalPages}
                                onClick={() => setPage(page + 1)}
                            >
                                Sau →
                            </button>
                        </div>
                    </div>
                )
            }


            {/* MI Link Modal */}
            {
                showMiModal && (
                    <div className="modal-overlay" onClick={() => setShowMiModal(false)}>
                        <div className="modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3 className="modal-title">Liên kết với Invoice MCC (MI)</h3>
                                <button className="modal-close" onClick={() => setShowMiModal(false)}>×</button>
                            </div>
                            <div className="modal-body">
                                <p style={{ marginBottom: 16, color: 'var(--text-muted)' }}>
                                    Chọn MI để liên kết <strong style={{ color: 'var(--primary)' }}>{selectedIds.size}</strong> tài khoản
                                </p>

                                {/* Search MI */}
                                <div className="search-input" style={{ marginBottom: 16 }}>
                                    <Search />
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Tìm kiếm Invoice MCC..."
                                        value={miSearch}
                                        onChange={(e) => setMiSearch(e.target.value)}
                                    />
                                </div>

                                {/* MI List */}
                                <div style={{ maxHeight: 300, overflow: 'auto', marginBottom: 16 }}>
                                    {miList.length > 0 ? (
                                        miList.map((mi) => (
                                            <div
                                                key={mi.id}
                                                onClick={() => handleLinkToMi(mi.id)}
                                                style={{
                                                    padding: '12px 16px',
                                                    borderRadius: 8,
                                                    marginBottom: 8,
                                                    background: 'var(--bg-secondary)',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    border: '1px solid var(--border)',
                                                    transition: 'all 0.2s'
                                                }}
                                                className="hover-highlight"
                                            >
                                                <div>
                                                    <div style={{ fontWeight: 500 }}>{mi.name}</div>
                                                    {mi.mccAccountId && (
                                                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                                            {mi.mccAccountId}
                                                        </div>
                                                    )}
                                                </div>
                                                <span className={`badge badge - ${mi.status === 'ACTIVE' ? 'success' : 'secondary'} `}>
                                                    {mi.status}
                                                </span>
                                            </div>
                                        ))
                                    ) : (
                                        <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>
                                            {miSearch ? 'Không tìm thấy MI nào' : 'Chưa có Invoice MCC nào'}
                                        </div>
                                    )}
                                </div>

                                {/* Create New MI Section */}
                                {!showCreateMi ? (
                                    <button
                                        className="btn btn-secondary"
                                        style={{ width: '100%' }}
                                        onClick={() => setShowCreateMi(true)}
                                    >
                                        <Plus size={16} />
                                        Tạo mới Invoice MCC (MI)
                                    </button>
                                ) : (
                                    <div style={{
                                        padding: 16,
                                        background: 'var(--bg-tertiary)',
                                        borderRadius: 8,
                                        border: '1px solid var(--border)'
                                    }}>
                                        <h4 style={{ marginBottom: 12 }}>Tạo mới MI</h4>
                                        <div className="form-group" style={{ marginBottom: 12 }}>
                                            <label className="form-label">Đối tác (Provider)</label>
                                            <select
                                                className="form-select"
                                                value={newMiPartnerId}
                                                onChange={(e) => setNewMiPartnerId(e.target.value)}
                                            >
                                                <option value="">-- Chọn đối tác --</option>
                                                {partners.map((p: any) => (
                                                    <option key={p.id} value={p.id}>
                                                        {p.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="form-group" style={{ marginBottom: 12 }}>
                                            <label className="form-label">Tên MI *</label>
                                            <input
                                                type="text"
                                                className="form-input"
                                                value={newMiName}
                                                onChange={(e) => setNewMiName(e.target.value)}
                                                placeholder="Nhập tên Invoice MCC"
                                            />
                                        </div>
                                        <div className="form-group" style={{ marginBottom: 12 }}>
                                            <label className="form-label">MCC Invoice ID *</label>
                                            <input
                                                type="text"
                                                className="form-input"
                                                value={newMiInvoiceId}
                                                onChange={(e) => setNewMiInvoiceId(e.target.value)}
                                                placeholder="xxx-xxx-xxxx"
                                            />
                                        </div>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <button
                                                className="btn btn-primary"
                                                onClick={handleCreateMi}
                                                disabled={!newMiName.trim() || !newMiInvoiceId.trim() || createMiMutation.isPending}
                                            >
                                                {createMiMutation.isPending ? 'Đang tạo...' : 'Tạo MI'}
                                            </button>
                                            <button
                                                className="btn btn-secondary"
                                                onClick={() => {
                                                    setShowCreateMi(false);
                                                    setNewMiName('');
                                                    setNewMiInvoiceId('');
                                                    setNewMiPartnerId('');
                                                }}
                                            >
                                                Hủy
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setShowMiModal(false)}>
                                    Đóng
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* MC Assignment Modal */}
            {
                showMcModal && (
                    <div className="modal-overlay" onClick={() => setShowMcModal(false)}>
                        <div className="modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3 className="modal-title">Giao cho Khách hàng (MC)</h3>
                                <button className="modal-close" onClick={() => setShowMcModal(false)}>×</button>
                            </div>
                            <div className="modal-body">
                                <p style={{ marginBottom: 16, color: 'var(--text-muted)' }}>
                                    Chọn khách hàng để giao <strong style={{ color: 'var(--primary)' }}>{selectedIds.size}</strong> tài khoản
                                </p>

                                {/* Search MC */}
                                <div className="search-input" style={{ marginBottom: 16 }}>
                                    <Search />
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Tìm kiếm khách hàng..."
                                        value={mcSearch}
                                        onChange={(e) => setMcSearch(e.target.value)}
                                    />
                                </div>

                                {/* MC List */}
                                <div style={{ maxHeight: 300, overflow: 'auto', marginBottom: 16 }}>
                                    {customerList.length > 0 ? (
                                        customerList.map((mc: any) => (
                                            <div
                                                key={mc.id}
                                                onClick={() => handleAssignToMc(mc.id)}
                                                style={{
                                                    padding: '12px 16px',
                                                    borderRadius: 8,
                                                    marginBottom: 8,
                                                    background: 'var(--bg-secondary)',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    border: '1px solid var(--border)',
                                                    transition: 'all 0.2s'
                                                }}
                                                className="hover-highlight"
                                            >
                                                <div>
                                                    <div style={{ fontWeight: 500 }}>{mc.name}</div>
                                                    {mc.contactInfo && (
                                                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                                            {mc.contactInfo}
                                                        </div>
                                                    )}
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span className={`badge badge - ${mc.status === 'ACTIVE' ? 'success' : 'secondary'} `}>
                                                        {mc.status === 'ACTIVE' ? 'Hoạt động' : 'Không hoạt động'}
                                                    </span>
                                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                                                        {mc._count?.accounts ?? 0} tài khoản
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>
                                            {mcSearch ? 'Không tìm thấy khách hàng nào' : 'Chưa có khách hàng nào'}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Account Detail Modal */}
            {
                selectedAccountId && accountDetail && (
                    <div className="modal-overlay" onClick={() => setSelectedAccountId(null)}>
                        <div className="modal" style={{ maxWidth: 800, maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3 className="modal-title">Chi tiết tài khoản</h3>
                                <button className="modal-close" onClick={() => setSelectedAccountId(null)}>×</button>
                            </div>
                            <div className="modal-body">
                                {/* Account Info */}
                                <div style={{
                                    background: 'var(--bg-tertiary)',
                                    padding: 16,
                                    borderRadius: 8,
                                    marginBottom: 20
                                }}>
                                    <h4 style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <code style={{ fontSize: 18 }}>{accountDetail.googleAccountId}</code>
                                        <span className={`badge badge - ${statusLabels[accountDetail.status]?.class || 'info'} `}>
                                            {statusLabels[accountDetail.status]?.label || accountDetail.status}
                                        </span>
                                    </h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                                        <div><strong>Tên tài khoản:</strong> {accountDetail.accountName}</div>
                                        <div><strong>Tiền tệ:</strong> {accountDetail.currency}</div>
                                        <div><strong>Lô (MA):</strong> {accountDetail.batch?.name || '-'}</div>
                                        <div><strong>Invoice MCC (MI):</strong> {accountDetail.currentMi?.name || <span style={{ color: 'var(--warning)' }}>Chưa link</span>}</div>
                                        <div><strong>Khách hàng (MC):</strong> {accountDetail.currentMc?.name || <span style={{ color: 'var(--warning)' }}>Chưa giao</span>}</div>
                                        <div><strong>Tổng chi tiêu:</strong> ${(accountDetail.totalSpending || 0).toLocaleString()}</div>
                                    </div>
                                </div>

                                {/* MI History */}
                                {accountDetail.miHistories?.length > 0 && (
                                    <div style={{ marginBottom: 20 }}>
                                        <h4 style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <ArrowRight size={18} /> Lịch sử liên kết MI
                                        </h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {accountDetail.miHistories.map((h: any, i: number) => (
                                                <div key={i} style={{
                                                    padding: 12,
                                                    background: 'var(--bg-secondary)',
                                                    borderRadius: 6,
                                                    borderLeft: `3px solid ${h.unlinkedAt ? 'var(--text-muted)' : 'var(--success)'} `
                                                }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <strong>{h.invoiceMcc?.name || 'N/A'}</strong>
                                                        <span className={`badge badge - ${h.unlinkedAt ? 'secondary' : 'success'} `}>
                                                            {h.unlinkedAt ? 'Đã hủy' : 'Hiện tại'}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                                                        Link: {new Date(h.linkedAt).toLocaleString('vi-VN')} bởi {h.linkedBy?.fullName || 'System'}
                                                        {h.unlinkedAt && (
                                                            <> | Hủy: {new Date(h.unlinkedAt).toLocaleString('vi-VN')}</>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* MC History */}
                                {accountDetail.mcHistories?.length > 0 && (
                                    <div style={{ marginBottom: 20 }}>
                                        <h4 style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <User size={18} /> Lịch sử giao khách hàng
                                        </h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {accountDetail.mcHistories.map((h: any, i: number) => (
                                                <div key={i} style={{
                                                    padding: 12,
                                                    background: 'var(--bg-secondary)',
                                                    borderRadius: 6,
                                                    borderLeft: `3px solid ${h.unassignedAt ? 'var(--text-muted)' : 'var(--primary)'} `
                                                }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <strong>{h.customer?.name || 'N/A'}</strong>
                                                        <span className={`badge badge - ${h.unassignedAt ? 'secondary' : 'primary'} `}>
                                                            {h.unassignedAt ? 'Đã hủy' : 'Hiện tại'}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                                                        Giao: {new Date(h.assignedAt).toLocaleString('vi-VN')} bởi {h.assignedBy?.fullName || 'System'}
                                                        {h.unassignedAt && (
                                                            <> | Hủy: {new Date(h.unassignedAt).toLocaleString('vi-VN')}</>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Activity Logs */}
                                <div>
                                    <h4 style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Clock size={18} /> Lịch sử hoạt động
                                    </h4>
                                    {accountLogs.length > 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflow: 'auto' }}>
                                            {accountLogs.map((log: any) => (
                                                <div key={log.id} style={{
                                                    padding: 12,
                                                    background: 'var(--bg-secondary)',
                                                    borderRadius: 6,
                                                    fontSize: 13
                                                }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                        <div>
                                                            <span className="badge badge-info" style={{ marginRight: 8 }}>{log.action}</span>
                                                            {log.description}
                                                        </div>
                                                        <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', marginLeft: 8 }}>
                                                            {new Date(log.createdAt).toLocaleString('vi-VN')}
                                                        </span>
                                                    </div>
                                                    <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>
                                                        bởi {log.user?.fullName || 'System'}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>
                                            Chưa có hoạt động nào được ghi nhận
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setSelectedAccountId(null)}>
                                    Đóng
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Confirm MI Link Modal */}
            <ConfirmModal
                isOpen={showConfirmMiModal && !!pendingMiAction}
                onClose={() => setShowConfirmMiModal(false)}
                onConfirm={() => {
                    if (pendingMiAction) {
                        linkMutation.mutate({ miId: pendingMiAction.miId, accountIds: pendingMiAction.accountIds });
                        setShowConfirmMiModal(false);
                    }
                }}
                title="Xác nhận liên kết Invoice MCC"
                confirmText="Xác nhận liên kết"
                type="warning"
                isLoading={linkMutation.isPending}
            >
                <p style={{ marginBottom: 16 }}>
                    Có <strong>{confirmAccounts.length}</strong> tài khoản đang được liên kết với Invoice MCC khác.
                    Bạn có chắc chắn muốn thay đổi liên kết không?
                </p>
                <div style={{ maxHeight: 200, overflow: 'auto', background: 'var(--bg-secondary)', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                    {confirmAccounts.map(account => (
                        <div key={account.id} style={{ fontSize: 13, marginBottom: 8, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                            <div><strong>{account.googleAccountId}</strong> - {account.accountName}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                <span style={{ color: 'var(--text-muted)' }}>{account.currentMi?.name}</span>
                                <ArrowRight size={12} />
                                <span style={{ color: 'var(--primary)', fontWeight: 500 }}>
                                    {miList.find(m => m.id === pendingMiAction?.miId)?.name}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </ConfirmModal>

            {/* Confirm MC Change Modal */}
            <ConfirmModal
                isOpen={showConfirmMcModal && !!pendingMcAction}
                onClose={() => setShowConfirmMcModal(false)}
                onConfirm={() => {
                    if (pendingMcAction) {
                        assignMutation.mutate({ customerId: pendingMcAction.customerId, accountIds: pendingMcAction.accountIds });
                        setShowConfirmMcModal(false);
                    }
                }}
                title="Xác nhận thay đổi Khách hàng"
                confirmText="Xác nhận thay đổi"
                type="warning"
                isLoading={assignMutation.isPending}
            >
                <p style={{ marginBottom: 16 }}>
                    Có <strong>{confirmAccounts.length}</strong> tài khoản đang được giao cho Khách hàng khác.
                    Bạn có chắc chắn muốn chuyển sang Khách hàng mới không?
                </p>
                <div style={{ maxHeight: 200, overflow: 'auto', background: 'var(--bg-secondary)', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                    {confirmAccounts.map(account => (
                        <div key={account.id} style={{ fontSize: 13, marginBottom: 8, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                            <div><strong>{account.googleAccountId}</strong> - {account.accountName}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                <span style={{ color: 'var(--text-muted)' }}>{account.currentMc?.name}</span>
                                <ArrowRight size={12} />
                                <span style={{ color: 'var(--primary)', fontWeight: 500 }}>
                                    {customerList.find((c: any) => c.id === pendingMcAction?.customerId)?.name || 'Khách hàng Mới'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </ConfirmModal>

            {/* Toast Notification */}
            {
                toast && (
                    <div className={`toast toast - ${toast?.type || 'info'} `}>
                        {toast?.type === 'success' ? '✓' : '✕'} {toast?.message}
                    </div>
                )
            }
            {/* Status Selection Modal */}
            {
                showStatusSelector && (
                    <div className="modal-overlay" onClick={() => setShowStatusSelector(false)}>
                        <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3 className="modal-title">Thay đổi trạng thái</h3>
                                <button className="modal-close" onClick={() => setShowStatusSelector(false)}>×</button>
                            </div>
                            <div className="modal-body">
                                <p style={{ marginBottom: 16 }}>Chọn trạng thái mới cho <strong>{selectedIds.size}</strong> tài khoản đã chọn:</p>
                                <div className="form-group">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer' }}>
                                        <input
                                            type="radio"
                                            name="status"
                                            value="ACTIVE"
                                            checked={targetStatus === 'ACTIVE'}
                                            onChange={(e) => setTargetStatus(e.target.value)}
                                        />
                                        <span className="badge badge-success">Hoạt động</span>
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                        <input
                                            type="radio"
                                            name="status"
                                            value="INACTIVE"
                                            checked={targetStatus === 'INACTIVE'}
                                            onChange={(e) => setTargetStatus(e.target.value)}
                                        />
                                        <span className="badge badge-secondary">Không hoạt động</span>
                                    </label>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setShowStatusSelector(false)}>Hủy</button>
                                <button
                                    className="btn btn-primary"
                                    onClick={() => {
                                        setShowStatusSelector(false);
                                        setConfirmBulkStatus({ isOpen: true, status: targetStatus });
                                    }}
                                >
                                    Tiếp tục
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Bulk Action Confirm Modals */}
            <ConfirmModal
                isOpen={confirmBulkStatus.isOpen}
                onClose={() => setConfirmBulkStatus({ isOpen: false, status: '' })}
                onConfirm={() => {
                    bulkUpdateStatusMutation.mutate({
                        accountIds: Array.from(selectedIds),
                        status: confirmBulkStatus.status
                    });
                    setConfirmBulkStatus({ isOpen: false, status: '' });
                }}
                title="Thay đổi trạng thái hàng loạt"
                type="warning"
                isLoading={bulkUpdateStatusMutation.isPending}
            >
                <div>
                    <p>Bạn có chắc chắn muốn thay đổi trạng thái của <strong>{selectedIds.size}</strong> tài khoản đã chọn thành <strong>{statusLabels[confirmBulkStatus.status]?.label}</strong>?</p>
                    <p style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                        Các tài khoản này sẽ được cập nhật trạng thái mới. Hành động này sẽ được ghi lại trong lịch sử.
                    </p>
                </div>
            </ConfirmModal>

            <ConfirmModal
                isOpen={confirmBulkUnlinkMi}
                onClose={() => setConfirmBulkUnlinkMi(false)}
                onConfirm={() => {
                    bulkUnlinkMiMutation.mutate(Array.from(selectedIds));
                    setConfirmBulkUnlinkMi(false);
                }}
                title="Hủy liên kết MI hàng loạt"
                type="danger"
                confirmText="Hủy liên kết"
                isLoading={bulkUnlinkMiMutation.isPending}
            >
                <div>
                    <p>Bạn có chắc chắn muốn hủy liên kết MI cho <strong>{selectedIds.size}</strong> tài khoản đã chọn?</p>
                    <p style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                        Các tài khoản này sẽ không còn thuộc về bất kỳ MI nào. Bạn có thể liên kết lại sau.
                    </p>
                </div>
            </ConfirmModal>

            <ConfirmModal
                isOpen={confirmBulkUnassignMc}
                onClose={() => setConfirmBulkUnassignMc(false)}
                onConfirm={() => {
                    bulkUnassignMcMutation.mutate(Array.from(selectedIds));
                    setConfirmBulkUnassignMc(false);
                }}
                title="Hủy giao Khách hàng hàng loạt"
                type="danger"
                confirmText="Hủy giao"
                isLoading={bulkUnassignMcMutation.isPending}
            >
                <div>
                    <p>Bạn có chắc chắn muốn hủy giao Khách hàng cho <strong>{selectedIds.size}</strong> tài khoản đã chọn?</p>
                    <p style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                        Các tài khoản này sẽ không còn thuộc về bất kỳ Khách hàng nào. Bạn có thể giao lại sau.
                    </p>
                </div>
            </ConfirmModal>
        </div >
    );
}

