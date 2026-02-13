/** Parse Google Ads ID format (xxx-xxx-xxxx) */
export const parseAccountId = (id: string): string | null => {
    if (!id) return null;
    const cleaned = id.toString().replace(/[^\d-]/g, '');
    const match = cleaned.match(/(\d{3})-?(\d{3})-?(\d{4})/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
};

/** Parse account status from Vietnamese/English */
export const parseAccountStatus = (status: string): 'ACTIVE' | 'INACTIVE' => {
    const lower = status?.toLowerCase() || '';
    if (lower.includes('hoạt động') || lower.includes('active') || lower.includes('đang hoạt động')) return 'ACTIVE';
    if (lower.includes('không') || lower.includes('inactive') || lower.includes('suspended') || lower.includes('chết') || lower.includes('died') || lower.includes('tắt') || lower.includes('tạm dừng') || lower.includes('paused') || lower.includes('vô hiệu hóa') || lower.includes('disabled')) return 'INACTIVE';
    return 'ACTIVE';
};
