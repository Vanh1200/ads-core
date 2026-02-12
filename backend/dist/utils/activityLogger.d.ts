import { ActivityAction } from '@prisma/client';
interface LogActivityParams {
    userId: string;
    action: ActivityAction;
    entityType: string;
    entityId: string;
    oldValues?: object;
    newValues?: object;
    description?: string;
    ipAddress?: string;
}
export declare const logActivity: (params: LogActivityParams) => Promise<void>;
export default logActivity;
