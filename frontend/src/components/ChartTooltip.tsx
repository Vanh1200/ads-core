import { type TooltipProps } from 'recharts';

const CustomChartTooltip = (props: TooltipProps<any, any>) => {
    const { active, payload, label } = props as any;

    if (active && payload && payload.length) {
        const date = new Date(label as string);
        const dayOfWeek = new Intl.DateTimeFormat('vi-VN', { weekday: 'long' }).format(date);
        const formattedDate = date.toLocaleDateString('vi-VN');
        const capitalizedDay = dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1);

        const formatCurrency = (amount: number) => {
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            }).format(amount);
        };

        return (
            <div style={{
                background: 'rgba(23, 23, 23, 0.95)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '12px',
                borderRadius: '8px',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
                backdropFilter: 'blur(4px)',
                color: '#fff',
                minWidth: '180px'
            }}>
                <div style={{
                    fontSize: '12px',
                    color: 'rgba(255, 255, 255, 0.6)',
                    marginBottom: '6px',
                    fontWeight: 500,
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    paddingBottom: '4px'
                }}>
                    {capitalizedDay}, {formattedDate}
                </div>
                {payload.map((entry: any, index: number) => (
                    <div key={index} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        marginTop: index > 0 ? '6px' : '0'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: entry.color || '#4f46e5'
                            }} />
                            <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.8)' }}>
                                Chi tiêu
                            </div>
                        </div>
                        <div style={{ fontSize: '14px', color: '#fff', fontWeight: 600 }}>
                            {formatCurrency(Number(entry.value))}
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return null;
};

export default CustomChartTooltip;
