import React from 'react';

export const SkeletonPulse: React.FC<{ className?: string, style?: React.CSSProperties }> = ({ className, style }) => (
    <div
        className={`skeleton-pulse ${className || ''}`}
        style={{
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-sm)',
            animation: 'pulse 1.5s infinite ease-in-out',
            ...style
        }}
    />
);

export const StatCardSkeleton = () => (
    <div className="stat-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <SkeletonPulse style={{ width: 48, height: 48, borderRadius: 12 }} />
            <div style={{ flex: 1 }}>
                <SkeletonPulse style={{ width: '40%', height: 24, marginBottom: 8 }} />
                <SkeletonPulse style={{ width: '60%', height: 16 }} />
            </div>
        </div>
    </div>
);

export const ChartSkeleton = () => (
    <div className="card" style={{ height: 400, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <SkeletonPulse style={{ width: 200, height: 24 }} />
            <SkeletonPulse style={{ width: 120, height: 32 }} />
        </div>
        <SkeletonPulse style={{ flex: 1, width: '100%' }} />
    </div>
);

export const TableSkeleton = ({ rows = 5 }: { rows?: number }) => (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SkeletonPulse style={{ width: 150, height: 24, marginBottom: 8 }} />
        {[...Array(rows)].map((_, i) => (
            <div key={i} style={{ display: 'flex', gap: 16, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                <SkeletonPulse style={{ width: 40, height: 40, borderRadius: 8 }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <SkeletonPulse style={{ width: '30%', height: 16 }} />
                    <SkeletonPulse style={{ width: '20%', height: 12 }} />
                </div>
                <SkeletonPulse style={{ width: 80, height: 24, borderRadius: 12 }} />
            </div>
        ))}
    </div>
);

export const ActivitySkeleton = ({ count = 5 }: { count?: number }) => (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SkeletonPulse style={{ width: 180, height: 24, marginBottom: 8 }} />
        {[...Array(count)].map((_, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <SkeletonPulse style={{ width: 32, height: 32, borderRadius: '50%' }} />
                <div style={{ flex: 1 }}>
                    <SkeletonPulse style={{ width: '80%', height: 14, marginBottom: 4 }} />
                    <SkeletonPulse style={{ width: '30%', height: 12 }} />
                </div>
            </div>
        ))}
    </div>
);
