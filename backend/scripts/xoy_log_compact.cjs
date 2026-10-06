// Run with a securely supplied DATABASE_URL (connection_limit=1). All backups
// live outside the production volume. Failure after truncation leaves the
// durable maintenance flag enabled until a verified restore is completed.
const { PrismaClient } = require('@prisma/client');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const readline = require('node:readline');
const { once } = require('node:events');
const { pipeline } = require('node:stream/promises');
const { permanentEventTypes } = require('../src/application/services/XoySupportLogRetentionPolicy.json');
const permanentTypes = new Set(permanentEventTypes);
const p = new PrismaClient();
const mode = process.argv[2];
const backup = path.resolve(process.argv[3] || '.xoy-maintenance/xoy-events.ndjson.gz');
const manifestPath = `${backup}.json`;
const lineQuery = `SELECT (to_jsonb(e) || jsonb_build_object('_metadata_sql_null', e.metadata IS NULL))::text AS line
    FROM xoy_support_log_events e WHERE id > $1 ORDER BY id LIMIT 2000`;

function receiptTime(row) { return new Date(`${row.created_at}Z`).getTime(); }
function retainRow(row, cutoff) { return permanentTypes.has(row.event_type) || receiptTime(row) >= cutoff; }
async function* databaseLines() {
    let cursor = '';
    for (;;) {
        const rows = await p.$queryRawUnsafe(lineQuery, cursor);
        if (!rows.length) break;
        for (const row of rows) { yield row.line; cursor = JSON.parse(row.line).id; }
    }
}
async function* backupLines() {
    const input = fs.createReadStream(backup).pipe(zlib.createGunzip());
    const reader = readline.createInterface({ input, crlfDelay: Infinity });
    for await (const line of reader) yield line;
}
async function digest(lines, cutoff) {
    const all = crypto.createHash('sha256');
    const retained = crypto.createHash('sha256');
    let count = 0, retainedCount = 0, previous = '';
    for await (const line of lines) {
        const row = JSON.parse(line);
        if (typeof row.id !== 'string' || row.id <= previous || !Number.isFinite(receiptTime(row))) {
            throw new Error('Backup contains invalid timestamps, duplicate IDs or an incorrect ordering');
        }
        previous = row.id;
        all.update(`${line}\n`); count++;
        if (retainRow(row, cutoff)) { retained.update(`${line}\n`); retainedCount++; }
        if (count % 20_000 === 0) console.log({ checkedRows: count });
    }
    return { count, sha256: all.digest('hex'), retainedCount, retainedSha256: retained.digest('hex') };
}
async function assertPaused() {
    const [state] = await p.$queryRawUnsafe('SELECT paused FROM xoy_support_log_maintenance WHERE id=1');
    if (!state?.paused) throw new Error('Log ingestion must be paused before compaction');
}
async function columns() {
    return (await p.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='xoy_support_log_events' ORDER BY ordinal_position`))
        .map(row => row.column_name);
}
async function createBackup() {
    await assertPaused();
    fs.mkdirSync(path.dirname(backup), { recursive: true, mode: 0o700 });
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    const output = fs.createWriteStream(backup, { flags: 'wx', mode: 0o600 });
    const gzip = zlib.createGzip();
    const finished = pipeline(gzip, output);
    finished.catch(() => {});
    for await (const line of databaseLines()) {
        if (!gzip.write(`${line}\n`)) await once(gzip, 'drain');
    }
    gzip.end(); await finished;
    const verified = await digest(backupLines(), cutoff);
    const actual = await digest(databaseLines(), cutoff);
    if (JSON.stringify(verified) !== JSON.stringify(actual)) throw new Error('Backup differs from the paused database');
    const manifest = { table: 'xoy_support_log_events', cutoff, createdAt: new Date().toISOString(),
        permanentEventTypes, columns: await columns(), ...verified };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
    for (const file of [backup, manifestPath]) {
        const descriptor = fs.openSync(file, 'r+');
        try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
    }
    console.log({ backup, ...manifest, columns: undefined });
}
async function restore(manifest) {
    // Old backups also contain the complete raw table. Recalculate what to
    // keep under the current policy rather than their old age-only checksum.
    const expected = await digest(backupLines(), manifest.cutoff);
    if (expected.count !== manifest.count || expected.sha256 !== manifest.sha256) throw new Error('Backup verification failed');
    if (JSON.stringify(await columns()) !== JSON.stringify(manifest.columns)) throw new Error('Backup schema differs from the current table');
    const identifiers = manifest.columns.map(name => {
        if (!/^[a-z_]+$/.test(name)) throw new Error('Unexpected column name');
        return `"${name}"`;
    });
    const fields = manifest.columns.map((name, index) => name === 'metadata'
        ? `CASE WHEN (item->>'_metadata_sql_null')::boolean THEN NULL ELSE item->'metadata' END`
        : `record.${identifiers[index]}`);
    const insert = `INSERT INTO xoy_support_log_events (${identifiers.join(',')})
        SELECT ${fields.join(',')} FROM jsonb_array_elements($1::jsonb) AS item
        CROSS JOIN LATERAL jsonb_populate_record(NULL::xoy_support_log_events, item) AS record
        ON CONFLICT (id) DO NOTHING`;
    let batch = [], restored = 0;
    const flush = async () => {
        if (!batch.length) return;
        await p.$executeRawUnsafe(insert, `[${batch.join(',')}]`);
        restored += batch.length; batch = [];
        await p.$executeRawUnsafe('CHECKPOINT');
        if (restored % 20000 === 0) console.log({ restored });
    };
    for await (const line of backupLines()) {
        if (!retainRow(JSON.parse(line), manifest.cutoff)) continue;
        batch.push(line);
        if (batch.length >= 2000) await flush();
    }
    await flush();
    const actual = await digest(databaseLines(), manifest.cutoff);
    if (actual.count !== expected.retainedCount || actual.sha256 !== expected.retainedSha256) {
        throw new Error('Restored data does not match the verified backup; ingestion remains paused');
    }
    await p.$executeRawUnsafe('VACUUM (ANALYZE) xoy_support_log_events');
    await p.$executeRawUnsafe('CHECKPOINT');
    console.log({ verifiedRestoredRows: actual.count, sha256: actual.sha256 });
}
async function main() {
    await p.$executeRawUnsafe("SET wal_compression='on'");
    if (mode === 'pause') {
        const changed = await p.$executeRawUnsafe('UPDATE xoy_support_log_maintenance SET paused=true WHERE id=1');
        if (changed !== 1) throw new Error('Maintenance state was not initialized');
        console.log('Support-log ingestion and retention paused.');
    } else if (mode === 'backup') {
        await createBackup();
    } else if (mode === 'compact' || mode === 'restore') {
        await assertPaused();
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const verified = await digest(backupLines(), manifest.cutoff);
        if (verified.count !== manifest.count || verified.sha256 !== manifest.sha256) throw new Error('Backup verification failed');
        if (mode === 'compact') {
            const current = await digest(databaseLines(), manifest.cutoff);
            if (JSON.stringify(current) !== JSON.stringify(verified)) throw new Error('Database changed since backup');
            const references = await p.$queryRawUnsafe(`SELECT conname FROM pg_constraint
                WHERE contype='f' AND confrelid='xoy_support_log_events'::regclass`);
            if (references.length) throw new Error('Incoming foreign keys prevent safe table-only truncation');
            await p.$executeRawUnsafe('TRUNCATE TABLE xoy_support_log_events');
            await p.$executeRawUnsafe('CHECKPOINT');
            console.log('Only the raw log table was truncated; starting restore.');
        }
        await restore(manifest);
        await p.$executeRawUnsafe('UPDATE xoy_support_log_maintenance SET paused=false WHERE id=1');
        console.log('Verified restore complete; log ingestion and retention resumed.');
    } else {
        throw new Error('Usage: node scripts/xoy_log_compact.cjs pause|backup|compact|restore [backup-file]');
    }
}
module.exports = { p, main, createBackup, restore, digest, backupLines, databaseLines };
if (require.main === module) {
    main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => p.$disconnect());
}
