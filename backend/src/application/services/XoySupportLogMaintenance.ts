import { Prisma } from '@prisma/client';
import prisma from '../../infrastructure/database/prisma';

export const XOY_LOG_MAINTENANCE = 'XOY_LOG_MAINTENANCE';

// A durable pause survives a maintenance connection dropping. The shared row
// lock drains in-flight writes before an operator sets paused=true.
export function withXoySupportLogWrite<T>(action: (database: Prisma.TransactionClient) => Promise<T>) {
    return prisma.$transaction(async database => {
        const [state] = await database.$queryRawUnsafe<Array<{ paused: boolean }>>(
            'SELECT paused FROM xoy_support_log_maintenance WHERE id = 1 FOR SHARE'
        );
        if (!state || state.paused) throw new Error(XOY_LOG_MAINTENANCE);
        return action(database);
    }, { timeout: 30_000 });
}
