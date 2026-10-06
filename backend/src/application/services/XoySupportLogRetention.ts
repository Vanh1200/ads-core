import { Prisma } from '@prisma/client';
import { withXoySupportLogWrite, XOY_LOG_MAINTENANCE } from './XoySupportLogMaintenance';
import retentionPolicy from './XoySupportLogRetentionPolicy.json';

export const XOY_LOG_RETENTION_MS = 48 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
export const XOY_PERMANENT_LOG_EVENT_TYPES = retentionPolicy.permanentEventTypes;

export function expiredXoySupportLogFilter(cutoff: Date): Prisma.XoySupportLogEventWhereInput {
    return { createdAt: { lt: cutoff }, eventType: { notIn: XOY_PERMANENT_LOG_EVENT_TYPES } };
}

// Retention uses the server's receipt time, not an extension's clock. Run
// counters, appeal templates and appeal summaries remain after detail logs expire.
export async function pruneXoySupportLogs(now = new Date(), maxBatches = 100) {
    const cutoff = new Date(now.getTime() - XOY_LOG_RETENTION_MS);
    const batchSize = 2_000;
    let deletedEvents = 0;
    let hasMore = false;
    for (let batch = 0; batch < maxBatches; batch++) {
        const [result] = await withXoySupportLogWrite(database => database.$queryRaw<Array<{ count: number }>>`
            WITH expired AS (
                SELECT id FROM xoy_support_log_events
                WHERE created_at < ${cutoff}
                  AND event_type NOT IN (${Prisma.join(XOY_PERMANENT_LOG_EVENT_TYPES)})
                ORDER BY created_at
                LIMIT ${batchSize}
                FOR UPDATE SKIP LOCKED
            ), deleted AS (
                DELETE FROM xoy_support_log_events AS events
                USING expired WHERE events.id = expired.id
                RETURNING events.id
            )
            SELECT COUNT(*)::integer AS count FROM deleted
        `);
        deletedEvents += result.count;
        hasMore = result.count === batchSize;
        if (!hasMore) break;
    }
    return { cutoff, deletedEvents, hasMore };
}

export function startXoySupportLogRetention() {
    let running = false;
    const cleanup = async () => {
        if (running) return;
        running = true;
        try {
            const result = await pruneXoySupportLogs();
            if (result.deletedEvents > 0) {
                console.log('[XOY] Expired support logs removed:', result);
            }
        } catch (error) {
            if (!(error instanceof Error && error.message === XOY_LOG_MAINTENANCE)) {
                console.error('[XOY] Support log retention failed:', error);
            }
        } finally {
            running = false;
        }
    };
    void cleanup();
    const timer = setInterval(() => void cleanup(), CLEANUP_INTERVAL_MS);
    timer.unref();
    return () => clearInterval(timer);
}
