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

function newSupportId() {
    return `SUP-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

export class XoySupportLogService {
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

    async list(input: { page?: unknown; limit?: unknown; supportId?: unknown; traceId?: unknown }) {
        const page = Math.max(1, Number(input.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(input.limit) || 20));
        const supportId = optionalText(input.supportId);
        const traceId = optionalText(input.traceId);
        const where: any = {
            ...(supportId ? { supportId: { contains: supportId, mode: 'insensitive' } } : {}),
            ...(traceId ? { events: { some: { traceId: { contains: traceId, mode: 'insensitive' } } } } : {}),
        };
        const [data, total] = await Promise.all([
            prisma.xoySupportLogRun.findMany({
                where,
                include: { device: { select: { displayName: true, extensionVersion: true, license: { select: { name: true } } } }, _count: { select: { events: true } } },
                orderBy: { updatedAt: 'desc' }, skip: (page - 1) * limit, take: limit,
            }),
            prisma.xoySupportLogRun.count({ where }),
        ]);
        return { data, total, page, limit };
    }

    async getBySupportId(supportId: string) {
        const run = await prisma.xoySupportLogRun.findUnique({
            where: { supportId },
            include: {
                device: { select: { displayName: true, extensionVersion: true, license: { select: { name: true, managerEmail: true } } } },
                events: { orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }] },
            },
        });
        if (!run) throw new Error('NOT_FOUND: Không tìm thấy support log');
        return run;
    }
}

export const xoySupportLogService = new XoySupportLogService();
