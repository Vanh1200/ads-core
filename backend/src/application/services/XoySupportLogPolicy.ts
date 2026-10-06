type SupportEvent = { success?: boolean | null; eventType?: string; metadata?: any; text: string };

// Also apply this to legacy extension uploads/manual retries. A discarded event
// is still acknowledged so it cannot build up in the client's durable outbox.
export function isRoutineSupportLog(event: SupportEvent) {
    if (event.success !== true || !['log', 'manual_log_retry'].includes(event.eventType || 'log')) return false;
    if (event.metadata != null && !(event.eventType === 'manual_log_retry' && event.metadata.source === 'manual_retry')) return false;
    const message = event.text.trim().replace(/^(?:(?:\[[^\]\r\n]+\]|[✓✗⚠])\s*)+/, '');
    return message.startsWith('→ ')
        || /^⏳ \[\d+\/\d+\] Đang kiểm tra trạng thái file/.test(message);
}

export function shouldStoreSupportEvent(event: SupportEvent) {
    // Counters are persisted on the run, without a new raw row per heartbeat.
    if (event.eventType === 'job_progress' && event.success !== false && event.metadata != null) return false;
    return !isRoutineSupportLog(event);
}
