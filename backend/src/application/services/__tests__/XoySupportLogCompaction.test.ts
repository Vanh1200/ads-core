import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import vm from 'node:vm';

const temporaryDirs: string[] = [];
afterEach(() => temporaryDirs.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));

function compactionFixture() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xoy-retention-test-'));
    temporaryDirs.push(directory);
    const backup = path.join(directory, 'events.ndjson.gz');
    const scriptPath = path.resolve('scripts/xoy_log_compact.cjs');
    const scriptRequire = createRequire(scriptPath);
    const columns = ['id', 'created_at', 'event_type', 'metadata'];
    const rows: any[] = [];
    const writes: string[] = [];
    const database = {
        async $queryRawUnsafe(query: string, cursor: string) {
            if (query.includes('information_schema.columns')) return columns.map(column_name => ({ column_name }));
            if (query.includes('to_jsonb')) return rows.filter(row => row.id > cursor).sort((a, b) => a.id.localeCompare(b.id)).slice(0, 2000).map(row => ({ line: JSON.stringify(row) }));
            throw new Error(`Unexpected query: ${query}`);
        },
        async $executeRawUnsafe(query: string, json: string) {
            writes.push(query);
            if (query.startsWith('INSERT INTO')) rows.push(...JSON.parse(json));
        },
    };
    const context = vm.createContext({
        require: (name: string) => name === '@prisma/client' ? { PrismaClient: class { constructor() { return database; } } } : scriptRequire(name),
        module: { exports: {} },
        process: { argv: ['node', scriptPath, 'restore', backup] },
        Buffer, console: { log() {} },
    });
    vm.runInContext(fs.readFileSync(scriptPath, 'utf8'), context);
    return { api: (context.module as any).exports, backup, rows, columns, writes };
}

const oldEvent = (id: string, eventType: string) => ({
    id, event_type: eventType, created_at: '2026-09-01T00:00:00',
    metadata: eventType === 'appeal_template_started' ? { template: { appealDomain: 'example.test' } } : null,
    _metadata_sql_null: eventType !== 'appeal_template_started',
});
async function* lines(rows: any[]) { for (const row of rows) yield JSON.stringify(row); }
const checksum = (rows: any[]) => createHash('sha256').update(rows.map(row => `${JSON.stringify(row)}\n`).join('')).digest('hex');

describe('XOY compaction preserves appeal history', () => {
    it('retains old templates and summaries, deletes other old events and keeps the exact cutoff boundary', async () => {
        const f = compactionFixture();
        const cutoff = Date.parse('2026-10-04T00:00:00Z');
        const events = [
            oldEvent('1', 'appeal_template_started'), oldEvent('2', 'appeal_summary'),
            oldEvent('3', 'rpc_error'), oldEvent('4', 'job_finished'), oldEvent('5', 'log'),
            { ...oldEvent('6', 'log'), created_at: '2026-10-04T00:00:00' },
        ];
        const digest = await f.api.digest(lines(events), cutoff);
        expect(digest.count).toBe(6);
        expect(digest.retainedCount).toBe(3);
        expect(digest.retainedSha256).toBe(checksum([events[0], events[1], events[5]]));
    });

    it('restores protected old events from a legacy full-table backup without losing template metadata', async () => {
        const f = compactionFixture();
        const events = [oldEvent('1', 'appeal_template_started'), oldEvent('2', 'appeal_summary'), oldEvent('3', 'log')];
        fs.writeFileSync(f.backup, gzipSync(events.map(row => `${JSON.stringify(row)}\n`).join('')));
        const legacyManifest = {
            cutoff: Date.parse('2026-10-04T00:00:00Z'), columns: f.columns,
            count: events.length, sha256: checksum(events),
            retainedCount: 0, retainedSha256: checksum([]),
        };
        await f.api.restore(legacyManifest);
        expect(f.rows).toEqual(events.slice(0, 2));
        expect(f.rows[0].metadata.template.appealDomain).toBe('example.test');
        expect(f.writes).toContain('VACUUM (ANALYZE) xoy_support_log_events');
    });

    it('rejects a corrupted backup before attempting any database writes', async () => {
        const f = compactionFixture();
        const events = [oldEvent('1', 'appeal_template_started')];
        fs.writeFileSync(f.backup, gzipSync(events.map(row => `${JSON.stringify(row)}\n`).join('')));
        await expect(f.api.restore({ cutoff: Date.now(), count: 1, sha256: 'wrong' })).rejects.toThrow('Backup verification failed');
        expect(f.writes).toEqual([]);
    });
});
