CREATE TABLE "xoy_support_log_runs" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "support_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "xoy_support_log_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "xoy_support_log_events" (
    "id" TEXT NOT NULL,
    "run_db_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "trace_id" TEXT,
    "job_id" TEXT,
    "job_type" TEXT,
    "success" BOOLEAN,
    "text" TEXT NOT NULL,
    "file_line" TEXT,
    "display_time" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "xoy_support_log_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "xoy_support_log_runs_support_id_key" ON "xoy_support_log_runs"("support_id");
CREATE UNIQUE INDEX "xoy_support_log_runs_device_id_run_id_key" ON "xoy_support_log_runs"("device_id", "run_id");
CREATE INDEX "xoy_support_log_runs_device_id_created_at_idx" ON "xoy_support_log_runs"("device_id", "created_at");
CREATE UNIQUE INDEX "xoy_support_log_events_run_db_id_event_id_key" ON "xoy_support_log_events"("run_db_id", "event_id");
CREATE INDEX "xoy_support_log_events_run_db_id_occurred_at_idx" ON "xoy_support_log_events"("run_db_id", "occurred_at");
CREATE INDEX "xoy_support_log_events_trace_id_idx" ON "xoy_support_log_events"("trace_id");

ALTER TABLE "xoy_support_log_runs" ADD CONSTRAINT "xoy_support_log_runs_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "xoy_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "xoy_support_log_events" ADD CONSTRAINT "xoy_support_log_events_run_db_id_fkey" FOREIGN KEY ("run_db_id") REFERENCES "xoy_support_log_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
