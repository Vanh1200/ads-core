CREATE INDEX IF NOT EXISTS "xoy_support_log_events_created_at_idx"
ON "xoy_support_log_events"("created_at");

CREATE TABLE IF NOT EXISTS "xoy_support_log_maintenance" (
    "id" INTEGER PRIMARY KEY CHECK ("id" = 1),
    "paused" BOOLEAN NOT NULL DEFAULT FALSE
);
INSERT INTO "xoy_support_log_maintenance" ("id", "paused")
VALUES (1, FALSE) ON CONFLICT ("id") DO NOTHING;
