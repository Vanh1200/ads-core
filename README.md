# Ads Core System

This repository contains the source code for the Ads Core System.

## Project Structure

- `backend/`: Backend source code.
- `frontend/`: Frontend source code.
- `docker-compose.yml`: Docker composition for running the services.

## Getting Started

1.  Clone the repository.
2.  Navigate to the project directory.
3.  Run `docker-compose up` to start the services.

## Deployment on Railway (Monolith Strategy)

We deploy both Frontend and Backend as a **single service** to save costs and simplify management.

1.  Sign up/Login to [Railway](https://railway.app).
2.  Click **"New Project"** -> **"Deploy from GitHub repo"**.
3.  Select this repository.
4.  Railway will find the `Dockerfile` in the root and start building.
5.  **Configure Variables**:
    -   `PORT`: `3001`
    -   `DATABASE_URL`: Add a PostgreSQL service and link it here.
    -   `JWT_SECRET`: Your secure secret.
    -   `FRONTEND_URL`: The public URL of this service (e.g., `https://ads-core-production.up.railway.app`).
    -   `VITE_API_URL`: **IMPORTANT**: Set this to `/api` (relative path) so the frontend talks to the backend on the same domain.
6.  **Redeploy** to apply changes.

### Development
1.  Frontend: `cd frontend && npm run dev`
2.  Backend: `cd backend && npm run dev`

## Deployment with Docker (Self-hosted)

Use this if you have a VPS (DigitalOcean Droplet, EC2).


1.  Make sure you have Docker installed.
2.  Run the following command in the root directory:

    ```bash
    docker-compose up --build -d
    ```

3.  The services will be available at:
    -   Frontend: `http://localhost`
    -   Backend: `http://localhost:3001`
    -   Database: `localhost:5432`

### Environment Variables

The `docker-compose.yml` file contains default environment variables. For production, **you must change** the `JWT_SECRET` and consider using a `.env` file or environment variables on your server.

### XOY support-log retention

Support uploads omit successful intermediate `→` messages and report-file polling
messages; errors, account outcomes/skips, templates and job start/finish remain.
The extension keeps full local display/file logs. Legacy uploads and manual retries
are filtered by the server too; filtered event IDs are acknowledged to stop retries.
`job_progress` updates run counters without creating raw event rows. The extension
sends these counters at a 5%/50-target step or once per minute while advancing.
Only `text` and timestamps are stored; duplicate `fileLine` payloads are ignored.

Appeal templates (`appeal_template_started`) and appeal summaries (`appeal_summary`)
in `xoy_support_log_events` are kept without an age limit, with their original text,
metadata and customer/job association. All other raw entries are retained for
48 hours from server receipt (`created_at`). After database initialization, the
backend expires old entries at startup and every hour, in batches of 2,000
(up to 200,000 per sweep). Concurrent
sweeps skip locked rows; errors are logged and retried the next hour. Job summaries
in `xoy_support_log_runs` remain available for operational metrics.

From `backend/`, with `DATABASE_URL` securely configured for the intended database:

```bash
npm run xoy:logs:retention              # Read-only table sizes and expired-row count
npm run xoy:logs:retention -- --apply   # Delete expired raw logs, vacuum, verify
```

Inspect the read-only report before applying cleanup. The maintenance command
keeps a fixed cutoff throughout the run, preserves appeal templates and summaries,
never deletes job summaries, and exits with an error if expired rows remain locked.
Standard `VACUUM` makes space reusable;
the Railway volume percentage may not immediately fall. It does not run
`VACUUM FULL`, which requires a table lock and extra disk space.

Log-table maintenance uses the singleton `xoy_support_log_maintenance` row.
Setting `paused=true` drains active ingestion/retention transactions and causes
new uploads to receive HTTP 503 with `Retry-After: 60`; the extension keeps its
pending events. This flag remains set across restarts and must only be cleared
after the restored raw logs have been verified. Licenses and job summaries are
unaffected. Backups and deployment staging belong in ignored `.xoy-maintenance/`
directories with restrictive permissions, outside the production volume.

For compaction, securely supply the production `DATABASE_URL` with
`connection_limit=1`, then run from `backend/`:

```bash
node scripts/xoy_log_compact.cjs pause
node scripts/xoy_log_compact.cjs backup ../.xoy-maintenance/backup/events.ndjson.gz
node scripts/xoy_log_compact.cjs compact ../.xoy-maintenance/backup/events.ndjson.gz
```

The backup is gzip NDJSON with a SHA-256 manifest, verified against the paused
database before truncation. Compaction restores rows within its fixed 48-hour cutoff
plus all appeal templates and summaries, then verifies the exact restored checksum
before resuming uploads. Existing full-table backups use the current preservation
policy when restored; log entries already removed without a backup cannot be recovered.
If restoration fails, keep ingestion paused and use the `restore` mode with the
same backup to retry; its inserts are idempotent. Never clear the pause flag
manually while a restore remains incomplete.
