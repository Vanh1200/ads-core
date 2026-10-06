import 'dotenv/config';
import prisma from '../src/infrastructure/database/prisma';
import { expiredXoySupportLogFilter, pruneXoySupportLogs, XOY_LOG_RETENTION_MS, XOY_PERMANENT_LOG_EVENT_TYPES } from '../src/application/services/XoySupportLogRetention';

// Default is read-only. Point DATABASE_URL at the intended database, inspect
// the report, then use --apply to expire raw XOY logs older than 48 hours.
async function main() {
    const cutoff = new Date(Date.now() - XOY_LOG_RETENTION_MS);
    const expiredFilter = expiredXoySupportLogFilter(cutoff);
    const tables = await prisma.$queryRaw<Array<{ table: string; bytes: bigint; estimatedRows: bigint }>>`
        SELECT relname AS "table", pg_total_relation_size(relid) AS bytes,
               n_live_tup AS "estimatedRows"
        FROM pg_stat_user_tables
        ORDER BY pg_total_relation_size(relid) DESC
        LIMIT 15
    `;
    console.table(tables.map(row => ({
        table: row.table, totalMB: (Number(row.bytes) / 1024 / 1024).toFixed(2),
        estimatedRows: Number(row.estimatedRows),
    })));
    const [total, expired, permanent] = await Promise.all([
        prisma.xoySupportLogEvent.count(),
        prisma.xoySupportLogEvent.count({ where: expiredFilter }),
        prisma.xoySupportLogEvent.count({ where: { eventType: { in: XOY_PERMANENT_LOG_EVENT_TYPES } } }),
    ]);
    console.log({ cutoff: cutoff.toISOString(), totalEvents: total, expiredEvents: expired, retainedEvents: total - expired, permanentEvents: permanent });
    if (!process.argv.includes('--apply')) return;
    let removed = 0;
    let result;
    do {
        result = await pruneXoySupportLogs(new Date(cutoff.getTime() + XOY_LOG_RETENTION_MS));
        removed += result.deletedEvents;
        console.log({ removed, hasMore: result.hasMore });
    } while (result.hasMore);
    // Standard vacuum allows normal traffic and makes deleted space reusable.
    // VACUUM FULL requires a table lock and additional disk; never do it here.
    await prisma.$executeRawUnsafe('VACUUM (ANALYZE) xoy_support_log_events');
    const remainingExpired = await prisma.xoySupportLogEvent.count({ where: expiredFilter });
    console.log({ removedEvents: removed, remainingExpiredEvents: remainingExpired });
    if (remainingExpired > 0) throw new Error('Cleanup incomplete; another transaction may have locked old logs. Retry after it finishes.');
}

main().catch(error => {
    // Do not print a database URL or any support-log contents.
    console.error('XOY log maintenance failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exitCode = 1;
}).finally(() => prisma.$disconnect());
