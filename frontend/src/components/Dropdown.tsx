import React, { useState, useRef, useEffect } from 'react';

export interface DropdownItem {
    key: string;
    label: React.ReactNode;
    icon?: React.ReactNode;
    onClick?: () => void;
    danger?: boolean;
    disabled?: boolean;
    type?: 'item' | 'divider' | 'header';
    searchKeywords?: string; // Optional keywords for better search
}

interface DropdownProps {
    trigger: React.ReactNode;
    items: DropdownItem[];
    align?: 'left' | 'right';
    width?: number | string;
    className?: string;
    searchable?: boolean;
    searchPlaceholder?: string;
}

export default function Dropdown({
    trigger,
    items,
    align = 'right',
    width = 220,
    className = '',
    searchable = false,
    searchPlaceholder = 'Tìm kiếm...'
}: DropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setSearch(''); // Reset search when closed
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    useEffect(() => {
        if (isOpen && searchable && searchInputRef.current) {
            // Focus search input when opened
            setTimeout(() => {
                searchInputRef.current?.focus();
            }, 50);
        }
    }, [isOpen, searchable]);

    const filteredItems = items.filter(item => {
        if (!search) return true;
        if (item.type === 'divider' || item.type === 'header') return true;

        const searchLower = search.toLowerCase();
        // Check label if it's a string
        if (typeof item.label === 'string' && item.label.toLowerCase().includes(searchLower)) {
            return true;
        }
        // Check searchKeywords
        if (item.searchKeywords && item.searchKeywords.toLowerCase().includes(searchLower)) {
            return true;
        }

        // If label is explicitly not a string and no keywords, we might miss it.
        // But most labels here are strings.
        return false;
    });

    return (
        <div className={`relative ${className}`} ref={dropdownRef} style={{ position: 'relative' }}>
            <div onClick={() => {
                if (isOpen) setSearch('');
                setIsOpen(!isOpen);
            }} style={{ cursor: 'pointer' }}>
                {trigger}
            </div>

            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    [align]: 0,
                    marginTop: 4,
                    background: '#1e293b', // Hardcoded surface color from theme to ensure opacity
                    backgroundColor: '#1e293b',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.3)',
                    zIndex: 50,
                    minWidth: width,
                    padding: 4,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    maxHeight: '400px',
                    overflowY: 'auto'
                }}>
                    {searchable && (
                        <div style={{ padding: '8px 8px 4px 8px', position: 'sticky', top: 0, background: '#1e293b', zIndex: 10 }}>
                            <input
                                ref={searchInputRef}
                                type="text"
                                className="form-input"
                                placeholder={searchPlaceholder}
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                    width: '100%',
                                    padding: '6px 10px',
                                    fontSize: 13,
                                    background: '#0f172a',
                                    border: '1px solid var(--border)',
                                    borderRadius: 4,
                                    color: 'white'
                                }}
                            />
                        </div>
                    )}

                    {filteredItems.map((item, index) => {
                        if (item.type === 'divider') {
                            // Don't show divider if it's the last item or adjacent to another divider/header (simple heuristic)
                            // For now just render
                            return <div key={item.key || index} style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />;
                        }
                        if (item.type === 'header') {
                            return <div key={item.key || index} style={{ padding: '6px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                {item.label}
                            </div>;
                        }

                        return (
                            <button
                                key={item.key || index}
                                onClick={() => {
                                    if (!item.disabled && item.onClick) {
                                        item.onClick();
                                        setIsOpen(false);
                                        setSearch('');
                                    }
                                }}
                                disabled={item.disabled}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    padding: '10px 12px',
                                    border: 'none',
                                    background: 'transparent',
                                    textAlign: 'left',
                                    cursor: item.disabled ? 'not-allowed' : 'pointer',
                                    color: item.danger ? 'var(--danger)' : 'var(--text)',
                                    opacity: item.disabled ? 0.5 : 1,
                                    borderRadius: 4,
                                    fontSize: 14,
                                    width: '100%',
                                    fontWeight: 500
                                }}
                                onMouseEnter={(e) => {
                                    if (!item.disabled) {
                                        e.currentTarget.style.background = item.danger ? 'rgba(239, 68, 68, 0.1)' : '#334155'; // surface-hover
                                    }
                                }}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                                {item.icon}
                                <span>{item.label}</span>
                            </button>
                        );
                    })}

                    {filteredItems.length === 0 && (
                        <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                            Không tìm thấy kết quả
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
