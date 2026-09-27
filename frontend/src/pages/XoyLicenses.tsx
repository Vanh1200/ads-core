import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Key, Plus } from 'lucide-react';
import { xoyLicensesApi } from '../api/client';

export default function XoyLicenses() {
    const queryClient = useQueryClient();
    const [issuedKey, setIssuedKey] = useState('');
    const { data, isLoading } = useQuery({ queryKey: ['xoy-licenses'], queryFn: xoyLicensesApi.list });
    const create = useMutation({
        mutationFn: xoyLicensesApi.create,
        onSuccess: (result) => {
            setIssuedKey(result.data.licenseKey);
            queryClient.invalidateQueries({ queryKey: ['xoy-licenses'] });
        },
    });
    const licenses = data?.data || [];

    const submit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        create.mutate({
            name: String(values.get('name') || ''),
            managerEmail: String(values.get('managerEmail') || ''),
            managerPassword: String(values.get('managerPassword') || ''),
            maxDevices: Number(values.get('maxDevices') || 3),
            expiresAt: String(values.get('expiresAt') || '') || undefined,
        });
    };

    return <div>
        <div className="page-header"><div><h1 className="page-title">XOY Licenses</h1><p className="page-subtitle">Tạo key kích hoạt và theo dõi profile Chrome đang dùng.</p></div></div>
        <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header"><Key size={18} /> Tạo license mới</div>
            <form onSubmit={submit} style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', padding: 16 }}>
                <input name="name" required placeholder="Tên khách hàng / gói" />
                <input name="managerEmail" required type="email" placeholder="Email quản lý" />
                <input name="managerPassword" required type="password" placeholder="Mật khẩu quản lý" />
                <input name="maxDevices" required type="number" min="1" defaultValue="3" placeholder="Số profile" />
                <input name="expiresAt" type="date" title="Ngày hết hạn (không bắt buộc)" />
                <button className="btn btn-primary" disabled={create.isPending}><Plus size={16} />{create.isPending ? 'Đang tạo...' : 'Tạo license'}</button>
            </form>
            {issuedKey && <div style={{ margin: '0 16px 16px', padding: 12, background: '#ecfdf5', borderRadius: 8 }}>
                Gửi key này cho khách (chỉ hiển thị một lần): <strong>{issuedKey}</strong>
            </div>}
            {create.isError && <div style={{ margin: '0 16px 16px', color: 'var(--danger)' }}>Không thể tạo license. Kiểm tra email quản lý có bị trùng không.</div>}
        </div>
        <div className="card"><div className="table-container"><table className="data-table"><thead><tr><th>Khách hàng</th><th>Key</th><th>Email quản lý</th><th>Profile active</th><th>Hết hạn</th><th>Trạng thái</th></tr></thead><tbody>
            {isLoading ? <tr><td colSpan={6} style={{ textAlign: 'center', padding: 28 }}>Đang tải...</td></tr> : licenses.map((license: any) => <tr key={license.id}><td>{license.name}</td><td>{license.keyPrefix}...</td><td>{license.managerEmail}</td><td>{license._count.devices}/{license.maxDevices}</td><td>{license.expiresAt ? new Date(license.expiresAt).toLocaleDateString('vi-VN') : 'Không giới hạn'}</td><td>{license.status}</td></tr>)}
        </tbody></table></div></div>
    </div>;
}
