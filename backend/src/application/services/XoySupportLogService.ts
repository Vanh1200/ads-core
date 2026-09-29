import crypto from 'crypto';
import prisma from '../../infrastructure/database/prisma';

type IncomingEvent = {
    eventId: string;
    occurredAt?: string;
    traceId?: string | null;
    jobId?: string | null;
    jobType?: string | null;
    success?: boolean | null;
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

function optionalDate(value: unknown, endOfDay = false) {
    const text = optionalText(value, 32);
    if (!text) return null;
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) throw new Error('BAD_REQUEST: Thời gian gửi log không hợp lệ');
    if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(text)) date.setHours(23, 59, 59, 999);
    return date;
}

function newSupportId() {
    return `SUP-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
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
            data: events.map((event) => ({ ...event, occurredAt: safeOccurredAt(event.occurredAt), runDbId: run.id })),
            skipDuplicates: true,
        });
        return { supportId: run.supportId, acceptedEventIds: events.map((event) => event.eventId) };
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
        const eventFilter = this.eventFilter(input);
        const hasEventFilter = Object.keys(eventFilter).length > 0;
        return prisma.xoySupportLogRun.findMany({
            where, orderBy: { updatedAt: 'desc' }, take: 500,
            include: {
                device: { select: { fingerprint: true, license: { select: { id: true, name: true, telegramId: true, plan: true } } } },
                events: { where: hasEventFilter ? eventFilter : undefined, orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }] },
            },
        });
    }

    async getBySupportId(supportId: string) {
        const run = await prisma.xoySupportLogRun.findUnique({
            where: { supportId },
            include: {
                device: { select: { fingerprint: true, license: { select: { name: true } } } },
                events: { orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }] },
            },
        });
        if (!run) throw new Error('NOT_FOUND: Không tìm thấy support log');
        return run;
    }
}

export const xoySupportLogService = new XoySupportLogService();
