import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';

interface SearchDropdownProps {
    isOpen: boolean;
    onClose: () => void;
    onApply: (value: string) => void;
    onClear: () => void;
    initialValue: string;
    placeholder?: string;
}

const SearchDropdown: React.FC<SearchDropdownProps> = ({
    isOpen,
    onClose,
    onApply,
    onClear,
    initialValue,
    placeholder = 'Nhập thông tin tìm kiếm...'
}) => {
    const [draftValue, setDraftValue] = useState(initialValue);
    const markerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Sync draftValue with initialValue when opened
    useEffect(() => {
        if (isOpen) {
            setDraftValue(initialValue);
        }
    }, [isOpen, initialValue]);

    const [coords, setCoords] = useState<{ top: number; left: number; width: string } | null>(null);

    useLayoutEffect(() => {
        if (isOpen && markerRef.current) {
            const calculatePosition = () => {
                const marker = markerRef.current;
                if (!marker || !marker.parentElement) return;

                // The parent button URL is wrapping a button and this marker. 
                // We want to align with the parent container (div relative)
                const parentRect = marker.parentElement.getBoundingClientRect();
                const viewportWidth = window.innerWidth;
                const margin = 12;

                let left = parentRect.left;
                // Min width 320px or button width, max 400px or viewport-margin
                // Actually the design wants a wide dropdown.
                const widthVal = Math.min(400, viewportWidth - 32);

                // Shift if going off screen
                if (left + widthVal > viewportWidth - margin) {
                    left = viewportWidth - margin - widthVal;
                }

                // Ensure not off left screen
                if (left < margin) {
                    left = margin;
                }

                setCoords({
                    top: parentRect.bottom + window.scrollY + 8,
                    left: left + window.scrollX,
                    width: `${widthVal}px`
                });
            };

            calculatePosition();

            // Recalculate on resize or scroll
            window.addEventListener('resize', calculatePosition);
            window.addEventListener('scroll', calculatePosition, true);

            return () => {
                window.removeEventListener('resize', calculatePosition);
                window.removeEventListener('scroll', calculatePosition, true);
            };
        }
        return undefined; // Explicitly return undefined if !isOpen
    }, [isOpen]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            // If clicking inside dropdown
            if (dropdownRef.current && dropdownRef.current.contains(event.target as Node)) {
                return;
            }
            // If clicking the trigger button (which is parent of marker)
            if (markerRef.current && markerRef.current.parentElement && markerRef.current.parentElement.contains(event.target as Node)) {
                return;
            }
            onClose();
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onClose]);

    if (!isOpen) return <div ref={markerRef} style={{ display: 'none' }} />;

    return (
        <>
            <div ref={markerRef} style={{ display: 'none' }} />
            {createPortal(
                <div
                    ref={dropdownRef}
                    style={{
                        position: 'absolute',
                        top: coords?.top || 0,
                        left: coords?.left || 0,
                        width: coords?.width || 'auto',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        padding: 16,
                        boxShadow: 'var(--shadow)',
                        zIndex: 9999, // High z-index to stay on top
                        display: coords ? 'flex' : 'none', // Hide until coords calculated
                        flexDirection: 'column',
                        gap: 12,
                    }}
                >
                    <div style={{ position: 'relative' }}>
                        <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
                        <textarea
                            autoFocus
                            className="form-input"
                            placeholder={placeholder}
                            value={draftValue}
                            onChange={(e) => setDraftValue(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    onApply(draftValue);
                                }
                            }}
                            style={{
                                paddingLeft: 36,
                                minHeight: 100,
                                resize: 'vertical',
                                fontSize: 14,
                                lineHeight: 1.6
                            }}
                        />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={(e) => {
                                e.stopPropagation();
                                setDraftValue('');
                                onClear();
                            }}
                        >
                            Xóa lọc
                        </button>
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={(e) => {
                                e.stopPropagation();
                                onApply(draftValue);
                            }}
                        >
                            Áp dụng
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

export default SearchDropdown;
