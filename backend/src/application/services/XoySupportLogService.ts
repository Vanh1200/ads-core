import crypto from 'crypto';
import prisma from '../../infrastructure/database/prisma';

type IncomingEvent = {
    eventId: string;
    occurredAt?: string;
    traceId?: string | null;
    jobId?: string | null;
    jobType?: string | null;
    success?: boolean | null;
    eventType: string;
    metadata: any;
    text: string;
    fileLine?: string | null;
    displayTime?: string | null;
};

type SupportLogFilters = {
    page?: unknown;
    limit?: unknown;
    supportId?: unknown;
    traceId?: unknown;
    jobType?: unknown;
    sentFrom?: unknown;
    sentTo?: unknown;
};

const MAX_EVENTS_PER_BATCH = 100;
const MAX_TEXT_LENGTH = 12_000;
const MAX_FIELD_LENGTH = 255;
const MAX_EVENT_TYPE_LENGTH = 64;
const MAX_METADATA_LENGTH = 12_000;

function requiredText(value: unknown, label: string, limit = MAX_FIELD_LENGTH) {
    const text = String(value || '').trim();
    if (!text || text.length > limit) throw new Error(`BAD_REQUEST: ${label} không hợp lệ`);
    return text;
}

function optionalText(value: unknown, limit = MAX_FIELD_LENGTH) {
    if (value == null || value === '') return null;
    return String(value).slice(0, limit);
}

function safeOccurredAt(value: unknown) {
    const date = value ? new Date(String(value)) : new Date();
    return Number.isNaN(date.getTime()) ? new Date() : date;
}

function safeJson(value: unknown) {
    if (value == null) return null;
    try {
        const json = JSON.stringify(value);
        if (json.length > MAX_METADATA_LENGTH) return { truncated: true, preview: json.slice(0, MAX_METADATA_LENGTH) };
        return JSON.parse(json);
    } catch {
        throw new Error('BAD_REQUEST: metadata không hợp lệ');
    }
}

function safeNumber(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function metadataArray(value: unknown) {
    return Array.isArray(value) ? value.map(String).slice(0, 2_000) : [];
}

function optionalDate(value: unknown, endOfDay = false) {
    const text = optionalText(value, 32);
    if (!text) return null;
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) throw new Error('BAD_REQUEST: Thời gian gửi log không hợp lệ');
    if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(text)) date.setHours(23, 59, 59, 999);
    return date;
}

function pagination(input: SupportLogFilters) {
    const requestedPage = Math.floor(Number(input.page));
    const requestedLimit = Math.floor(Number(input.limit));
    return {
        page: Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1,
        limit: Number.isFinite(requestedLimit) ? Math.min(100, Math.max(10, requestedLimit)) : 30,
    };
}

function newSupportId() {
    return `SUP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

export class XoySupportLogService {
    private eventFilter(input: SupportLogFilters) {
        const traceId = optionalText(input.traceId);
        const jobType = optionalText(input.jobType);
        return {
            ...(traceId ? { traceId: { contains: traceId, mode: 'insensitive' as const } } : {}),
            ...(jobType ? { jobType } : {}),
        };
    }

    private filters(input: SupportLogFilters, licenseId?: string) {
        const supportId = optionalText(input.supportId);
        const sentFrom = optionalDate(input.sentFrom);
        const sentTo = optionalDate(input.sentTo, true);
        const eventFilter = this.eventFilter(input);
        return {
            ...(licenseId ? { device: { licenseId } } : {}),
            ...(supportId ? { supportId: { contains: supportId, mode: 'insensitive' as const } } : {}),
            ...(Object.keys(eventFilter).length ? { events: { some: eventFilter } } : {}),
            ...((sentFrom || sentTo) ? { updatedAt: { ...(sentFrom ? { gte: sentFrom } : {}), ...(sentTo ? { lte: sentTo } : {}) } } : {}),
        };
    }

    async ingest(deviceId: string, input: { runId: unknown; events: unknown }) {
        const runId = requiredText(input.runId, 'runId');
        if (!Array.isArray(input.events) || input.events.length === 0 || input.events.length > MAX_EVENTS_PER_BATCH) {
            throw new Error(`BAD_REQUEST: events phải có từ 1 đến ${MAX_EVENTS_PER_BATCH} dòng`);
        }
        const events: IncomingEvent[] = input.events.map((event: any) => ({
            eventId: requiredText(event?.eventId, 'eventId'),
            occurredAt: event?.occurredAt,
            traceId: optionalText(event?.traceId),
            jobId: optionalText(event?.jobId),
            jobType: optionalText(event?.jobType),
            success: typeof event?.success === 'boolean' ? event.success : null,
            eventType: optionalText(event?.eventType, MAX_EVENT_TYPE_LENGTH) || 'log',
            metadata: safeJson(event?.metadata),
            text: requiredText(event?.text, 'text', MAX_TEXT_LENGTH),
            fileLine: optionalText(event?.fileLine, MAX_TEXT_LENGTH),
            displayTime: optionalText(event?.displayTime),
        }));

        const run = await prisma.xoySupportLogRun.upsert({
            where: { deviceId_runId: { deviceId, runId } },
            create: { deviceId, runId, supportId: newSupportId() },
            update: {},
        });
        await prisma.xoySupportLogEvent.createMany({
            // Prisma distinguishes a database NULL from a JSON null. Support
            // log lines normally do not have metadata, so omit the JSON field
            // entirely rather than passing JavaScript null and rejecting the
            // whole batch (including a paused job's lifecycle event).
            data: events.map(({ metadata, ...event }) => ({
                ...event,
                occurredAt: safeOccurredAt(event.occurredAt),
                runDbId: run.id,
                ...(metadata == null ? {} : { metadata }),
            })),
            skipDuplicates: true,
        });
        const lifecycle = [...events].reverse().find((event) =>
            ['job_started', 'job_progress', 'job_finished'].includes(event.eventType || '') && event.metadata
        );
        // Lifecycle events carry the counters, while a restored job retried
        // manually may only have ordinary log events. Both forms include the
        // job identity, so persist that identity from any event in the run.
        const jobContext = lifecycle || [...events].reverse().find((event) =>
            Boolean(event.jobId || event.traceId || event.jobType)
        );
        if (jobContext) {
            const metadata: any = lifecycle?.metadata;
            await prisma.xoySupportLogRun.update({
                where: { id: run.id },
                data: {
                    jobId: jobContext.jobId || undefined,
                    traceId: jobContext.traceId || undefined,
                    jobType: jobContext.jobType || undefined,
                    ...(metadata ? {
                        jobStatus: optionalText(metadata.jobStatus),
                        inputIds: metadataArray(metadata.inputIds),
                        inputMccIds: metadataArray(metadata.inputMccIds),
                        targetTotal: safeNumber(metadata.totalTargets),
                        processedTargets: safeNumber(metadata.processedTargets),
                        successfulTargets: safeNumber(metadata.successfulTargets),
                        failedTargets: safeNumber(metadata.failedTargets),
                        skippedTargets: safeNumber(metadata.skippedTargets),
                        startedAt: metadata.startedAt ? safeOccurredAt(metadata.startedAt) : undefined,
                        finishedAt: metadata.finishedAt ? safeOccurredAt(metadata.finishedAt) : undefined,
                    } : {}),
                },
            });
        }
        return { supportId: run.supportId, acceptedEventIds: events.map((event) => event.eventId) };
    }

    async operationalMetrics(input: Pick<SupportLogFilters, 'sentFrom' | 'sentTo'>) {
        const sentFrom = optionalDate(input.sentFrom) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const sentTo = optionalDate(input.sentTo, true) || new Date();
        const where = { updatedAt: { gte: sentFrom, lte: sentTo } };
        const [runs, licenseStatuses, rpcErrors] = await Promise.all([
            prisma.xoySupportLogRun.findMany({
                where, orderBy: { updatedAt: 'desc' }, take: 5_000,
                select: {
                    id: true, supportId: true, jobType: true, jobStatus: true, targetTotal: true,
                    processedTargets: true, successfulTargets: true, failedTargets: true, skippedTargets: true,
                    startedAt: true, finishedAt: true, updatedAt: true,
                    device: { select: { license: { select: { id: true, name: true } } } },
                },
            }),
            prisma.xoyLicense.groupBy({ by: ['status'], _count: { _all: true } }),
            prisma.xoySupportLogEvent.count({ where: { eventType: 'rpc_error', occurredAt: { gte: sentFrom, lte: sentTo } } }),
        ]);
        const byJobType = new Map<string, any>();
        const byDay = new Map<string, any>();
        // A run created by legacy/manual support logs has no lifecycle event,
        // therefore no job type. It is support history, not an operational job.
        const operationalRuns = runs.filter((run) => Boolean(run.jobType));
        let completed = 0; let failed = 0; let stopped = 0; let active = 0;
        let targets = 0; let processed = 0; let successes = 0; let failures = 0; let skipped = 0;
        for (const run of operationalRuns) {
            const type = run.jobType!;
            const item = byJobType.get(type) || { jobType: type, jobs: 0, completed: 0, failed: 0, stopped: 0, active: 0, targets: 0, processed: 0, successes: 0, failures: 0, skipped: 0 };
            const status = run.jobStatus || 'RUNNING';
            item.jobs++; item.targets += run.targetTotal; item.processed += run.processedTargets; item.successes += run.successfulTargets; item.failures += run.failedTargets; item.skipped += run.skippedTargets;
            if (status === 'COMPLETED') { item.completed++; completed++; } else if (status === 'FAILED') { item.failed++; failed++; } else if (status === 'STOPPED' || status === 'INTERRUPTED') { item.stopped++; stopped++; } else { item.active++; active++; }
            byJobType.set(type, item);
            targets += run.targetTotal; processed += run.processedTargets; successes += run.successfulTargets; failures += run.failedTargets; skipped += run.skippedTargets;
            const day = run.updatedAt.toISOString().slice(0, 10);
            const dayItem = byDay.get(day) || { day, jobs: 0, successes: 0, failures: 0 };
            dayItem.jobs++; dayItem.successes += run.successfulTargets; dayItem.failures += run.failedTargets; byDay.set(day, dayItem);
        }
        return {
            generatedAt: new Date(), period: { sentFrom, sentTo }, capped: runs.length === 5_000,
            overview: { jobs: operationalRuns.length, completed, failed, stopped, active, targets, processed, successes, failures, skipped, rpcErrors },
            licenseStatuses: licenseStatuses.map((row) => ({ status: row.status, count: row._count._all })),
            byJobType: [...byJobType.values()].sort((a, b) => b.jobs - a.jobs),
            byDay: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
            recentJobs: operationalRuns.slice(0, 50).map((run) => ({ ...run, license: run.device.license })),
        };
    }

    async list(input: SupportLogFilters) {
        const where = this.filters(input);
        const eventFilter = this.eventFilter(input);
        const hasEventFilter = Object.keys(eventFilter).length > 0;
        // The overview is intentionally grouped by paid license/customer, not
        // Chrome profile. A practical upper bound prevents an unfiltered admin
        // view from loading an unlimited operational log history at once.
        const runs = await prisma.xoySupportLogRun.findMany({
            where, orderBy: { updatedAt: 'desc' }, take: 500,
            include: {
                device: { select: { license: { select: { id: true, name: true, telegramId: true, plan: true } } } },
                events: { where: hasEventFilter ? eventFilter : undefined, select: { jobType: true } },
            },
        });
        const groups = new Map<string, any>();
        for (const run of runs) {
            const license = run.device.license;
            const group = groups.get(license.id) || { license, runs: 0, events: 0, jobTypes: new Set<string>(), lastSentAt: run.updatedAt };
            group.runs += 1;
            group.events += run.events.length;
            if (run.updatedAt > group.lastSentAt) group.lastSentAt = run.updatedAt;
            for (const event of run.events) if (event.jobType) group.jobTypes.add(event.jobType);
            groups.set(license.id, group);
        }
        const data = [...groups.values()].map((group) => ({ ...group, jobTypes: [...group.jobTypes].sort() }))
            .sort((left, right) => right.lastSentAt.getTime() - left.lastSentAt.getTime());
        return { data, total: data.length, capped: runs.length === 500 };
    }

    async listByLicense(licenseId: string, input: SupportLogFilters) {
        const where = this.filters(input, licenseId);
        const { page, limit } = pagination(input);
        const [data, total] = await Promise.all([
            prisma.xoySupportLogRun.findMany({
                where, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * limit, take: limit,
                include: { device: { select: { license: { select: { id: true, name: true, telegramId: true, plan: true } } } } },
            }),
            prisma.xoySupportLogRun.count({ where }),
        ]);
        return { data, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
    }

    async getBySupportId(supportId: string, input: SupportLogFilters = {}) {
        const { page, limit } = pagination(input);
        const eventFilter = this.eventFilter(input);
        const [run, total] = await Promise.all([
            prisma.xoySupportLogRun.findUnique({
            where: { supportId },
            include: {
                device: { select: { license: { select: { name: true } } } },
                events: {
                    where: Object.keys(eventFilter).length ? eventFilter : undefined,
                    orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
                    skip: (page - 1) * limit,
                    take: limit,
                },
            },
            }),
            prisma.xoySupportLogEvent.count({
                where: { run: { supportId }, ...(Object.keys(eventFilter).length ? eventFilter : {}) },
            }),
        ]);
        if (!run) throw new Error('NOT_FOUND: Không tìm thấy support log');
        return { data: run, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
    }
}

export const xoySupportLogService = new XoySupportLogService();
