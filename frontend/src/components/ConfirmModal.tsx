import { AlertTriangle, Info, X } from 'lucide-react';
import React from 'react';

interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: React.ReactNode;
    children: React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'warning' | 'info';
    isLoading?: boolean;
    maxWidth?: number | string;
}

export default function ConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    children,
    confirmText = 'Xác nhận',
    cancelText = 'Hủy',
    type = 'warning',
    isLoading = false,
    maxWidth = 500
}: ConfirmModalProps) {
    if (!isOpen) return null;

    const getIcon = () => {
        switch (type) {
            case 'danger':
                return <AlertTriangle size={24} color="var(--danger)" />;
            case 'warning':
                return <AlertTriangle size={24} color="var(--warning)" />;
            case 'info':
                return <Info size={24} color="var(--info)" />;
            default:
                return <AlertTriangle size={24} />;
        }
    };

    const getTitleColor = () => {
        switch (type) {
            case 'danger': return 'var(--danger)';
            case 'warning': return 'var(--warning)';
            case 'info': return 'var(--info)';
            default: return 'var(--text)';
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" style={{ maxWidth }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8, color: getTitleColor() }}>
                        {getIcon()}
                        {title}
                    </h3>
                    <button className="modal-close" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>
                <div className="modal-body">
                    {children}
                </div>
                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose} disabled={isLoading}>
                        {cancelText}
                    </button>
                    <button
                        className={`btn btn-${type === 'danger' ? 'danger' : 'primary'}`}
                        onClick={onConfirm}
                        disabled={isLoading}
                    >
                        {isLoading ? 'Đang xử lý...' : confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
