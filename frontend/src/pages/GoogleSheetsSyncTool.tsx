import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Play, Search, Terminal, Trash2, Layout, Calendar } from 'lucide-react';
import { customersApi } from '../api/client';

interface Customer {
    id: string;
    name: string;
    googleSheetId: string | null;
}

export default function GoogleSheetsSyncTool() {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [logs, setLogs] = useState<{ message: string; timestamp: Date }[]>([]);
    const [isSyncing, setIsSyncing] = useState(false);
    const [quickSync, setQuickSync] = useState(false);
    
    // Default dates: yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    
    const [startDate, setStartDate] = useState(dateStr);
    const [endDate, setEndDate] = useState(dateStr);
    const [search, setSearch] = useState('');

    const logEndRef = useRef<HTMLDivElement>(null);

    const { data: customersData, isLoading } = useQuery({
        queryKey: ['customers-simple'],
        queryFn: () => customersApi.list({ limit: 1000 }).then(res => res.data.data.data as Customer[]),
    });

    const customers = customersData || [];
    const filteredCustomers = customers.filter(c => 
        c.name.toLowerCase().includes(search.toLowerCase()) || 
        c.id.toLowerCase().includes(search.toLowerCase())
    );

    const addLog = (message: string) => {
        setLogs(prev => [...prev, { message, timestamp: new Date() }]);
    };

    const clearLogs = () => setLogs([]);

    useEffect(() => {
        if (logEndRef.current) {
            logEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs]);

    const handleBulkSync = async () => {
        if (!quickSync && selectedIds.size === 0) {
            alert('Vui lòng chọn ít nhất một khách hàng hoặc chọn Đồng bộ nhanh');
            return;
        }

        setIsSyncing(true);
        clearLogs();
        addLog(`🚀 Bắt đầu quá trình đồng bộ (${startDate} đến ${endDate})...`);

        const token = localStorage.getItem('token');
        const payload = {
            customerIds: quickSync ? [] : Array.from(selectedIds),
            quickSync,
            startDate,
            endDate
        };

        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/customers/bulk-sync-sheets`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error('Network response was not ok');

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\n');

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6));
                                if (data.message) addLog(data.message);
                            } catch (e) {
                                // Ignore parse errors for partial chunks
                            }
                        } else if (line.startsWith('event: end')) {
                            addLog('✅ Hoàn thành tất cả các tác vụ.');
                        }
                    }
                }
            }
        } catch (error: any) {
            addLog(`❌ Lỗi đồng bộ: ${error.message}`);
        } finally {
            setIsSyncing(false);
        }
    };

    const toggleAll = () => {
        if (selectedIds.size === filteredCustomers.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredCustomers.map(c => c.id)));
        }
    };

    const toggleSingle = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', height: '100%' }}>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Công cụ Đồng bộ Google Sheets</h1>
                    <p className="page-subtitle">Đồng bộ chi tiêu hàng loạt cho các khách hàng (MC)</p>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', flex: 1, minHeight: 0 }}>
                {/* Left: Configuration & Selection */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div className="card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Layout size={18} style={{ color: 'var(--primary)' }} />
                            <h3 style={{ margin: 0 }}>Cấu hình & Danh sách</h3>
                        </div>
                    </div>
                    
                    <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1, overflow: 'hidden' }}>
                        {/* Options */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div className="form-group">
                                <label className="form-label">
                                    <Calendar size={14} style={{ marginRight: 6 }} />
                                    Từ ngày
                                </label>
                                <input type="date" className="form-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">
                                    <Calendar size={14} style={{ marginRight: 6 }} />
                                    Đến ngày
                                </label>
                                <input type="date" className="form-input" value={endDate} onChange={e => setEndDate(e.target.value)} />
                            </div>
                        </div>

                        <div className="form-group" style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: 'var(--radius-sm)' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                <input 
                                    type="checkbox" 
                                    className="form-checkbox" 
                                    checked={quickSync} 
                                    onChange={e => setQuickSync(e.target.checked)} 
                                />
                                <span style={{ fontWeight: 600 }}>Đồng bộ nhanh (Quick Sync)</span>
                            </label>
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', marginLeft: '24px' }}>
                                Hệ thống sẽ tự động xác định các khách hàng có phát sinh chi tiêu trong khoảng thời gian đã chọn để cập nhật.
                            </p>
                        </div>

                        {!quickSync && (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
                                <div style={{ marginBottom: '12px', display: 'flex', gap: '8px' }}>
                                    <div style={{ position: 'relative', flex: 1 }}>
                                        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                        <input 
                                            type="text" 
                                            className="form-input" 
                                            placeholder="Tìm khách hàng..." 
                                            style={{ paddingLeft: '36px' }} 
                                            value={search}
                                            onChange={e => setSearch(e.target.value)}
                                        />
                                    </div>
                                    <button className="btn btn-secondary" onClick={toggleAll}>
                                        {selectedIds.size === filteredCustomers.length ? 'Bỏ chọn hết' : 'Chọn tất cả'}
                                    </button>
                                </div>

                                <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                                    {isLoading ? (
                                        <div style={{ padding: '20px', textAlign: 'center' }}>Đang tải...</div>
                                    ) : filteredCustomers.length > 0 ? (
                                        <table className="data-table" style={{ width: '100%' }}>
                                            <tbody style={{ fontSize: '13px' }}>
                                                {filteredCustomers.map(c => (
                                                    <tr 
                                                        key={c.id} 
                                                        onClick={() => toggleSingle(c.id)} 
                                                        style={{ cursor: 'pointer', background: selectedIds.has(c.id) ? 'var(--bg-highlight)' : 'transparent' }}
                                                    >
                                                        <td style={{ width: '40px', textAlign: 'center' }}>
                                                            <input type="checkbox" className="form-checkbox" checked={selectedIds.has(c.id)} readOnly />
                                                        </td>
                                                        <td>
                                                            <strong>{c.name}</strong>
                                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.id}</div>
                                                        </td>
                                                        <td style={{ textAlign: 'right' }}>
                                                            {c.googleSheetId ? (
                                                                <span className="badge badge-success">Sẵn sàng</span>
                                                            ) : (
                                                                <span className="badge badge-danger">Thiếu Sheet ID</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    ) : (
                                        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>Không tìm thấy kết quả</div>
                                    )}
                                </div>
                            </div>
                        )}

                        <button 
                            className="btn btn-primary" 
                            style={{ width: '100%', height: '48px', fontSize: '16px', gap: '12px' }}
                            onClick={handleBulkSync}
                            disabled={isSyncing}
                        >
                            <Play size={20} />
                            {isSyncing ? 'Đang thực hiện...' : 'Bắt đầu đồng bộ'}
                        </button>
                    </div>
                </div>

                {/* Right: Real-time Terminal Logs */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', background: '#0f172a', border: '1px solid #1e293b' }}>
                    <div className="card-header" style={{ borderBottom: '1px solid #1e293b', background: '#1e293b', padding: '12px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8' }}>
                                <Terminal size={18} />
                                <h3 style={{ margin: 0, fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tiến trình xử lý</h3>
                            </div>
                            <button className="btn-icon btn-sm" onClick={clearLogs} style={{ color: '#94a3b8' }} title="Xóa logs">
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                    
                    <div className="card-body" style={{ flex: 1, overflowY: 'auto', padding: '16px', fontFamily: '"Fira Code", "Source Code Pro", monospace', fontSize: '13px', color: '#e2e8f0', lineHeight: 1.6 }}>
                        {logs.length === 0 ? (
                            <div style={{ color: '#64748b', fontStyle: 'italic', textAlign: 'center', marginTop: '40px' }}>
                                Chưa có hoạt động nào. Hãy nhấn "Bắt đầu đồng bộ" để xem logs...
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {logs.map((log, i) => (
                                    <div key={i} style={{ display: 'flex', gap: '12px' }}>
                                        <span style={{ color: '#64748b', flexShrink: 0, userSelect: 'none' }}>
                                            [{log.timestamp.toLocaleTimeString([], { hour12: false })}]
                                        </span>
                                        <span style={{ 
                                            color: log.message.includes('❌') ? '#f43f5e' : 
                                                   log.message.includes('✅') || log.message.includes('🎉') ? '#10b981' : 
                                                   log.message.includes('🚀') || log.message.includes('🔍') ? '#38bdf8' : 
                                                   '#e2e8f0' 
                                        }}>
                                            {log.message}
                                        </span>
                                    </div>
                                ))}
                                <div ref={logEndRef} />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
