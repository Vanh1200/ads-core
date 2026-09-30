ALTER TABLE "xoy_support_log_runs"
  ADD COLUMN "job_id" TEXT,
  ADD COLUMN "trace_id" TEXT,
  ADD COLUMN "job_type" TEXT,
  ADD COLUMN "job_status" TEXT,
  ADD COLUMN "input_ids" JSONB,
  ADD COLUMN "input_mcc_ids" JSONB,
  ADD COLUMN "target_total" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "processed_targets" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "successful_targets" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "failed_targets" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "skipped_targets" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "started_at" TIMESTAMP(3),
  ADD COLUMN "finished_at" TIMESTAMP(3);

ALTER TABLE "xoy_support_log_events"
  ADD COLUMN "event_type" TEXT NOT NULL DEFAULT 'log',
  ADD COLUMN "metadata" JSONB;

CREATE INDEX "xoy_support_log_runs_job_type_job_status_updated_at_idx"
  ON "xoy_support_log_runs"("job_type", "job_status", "updated_at");
