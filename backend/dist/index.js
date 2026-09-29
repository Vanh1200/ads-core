"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Diagnostic listeners (MUST BE AT THE VERY TOP)
process.on('SIGTERM', () => {
    console.warn('[PROCESS] SIGTERM received. Server is shutting down...');
    process.exit(0);
});
process.on('SIGINT', () => {
    console.warn('[PROCESS] SIGINT received. Server is shutting down...');
    process.exit(0);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('[PROCESS] Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('[PROCESS] Uncaught Exception:', err);
    // Give time for logs to be written
    setTimeout(() => process.exit(1), 1000);
});
// Set default NODE_ENV if missing
if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'production';
}
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const path_1 = __importDefault(require("path"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
// Import new routes (Clean Architecture)
const auth_routes_1 = __importDefault(require("./web/routes/auth.routes"));
const user_routes_1 = __importDefault(require("./web/routes/user.routes"));
const partner_routes_1 = __importDefault(require("./web/routes/partner.routes"));
const batch_routes_1 = __importDefault(require("./web/routes/batch.routes"));
const invoiceMCC_routes_1 = __importDefault(require("./web/routes/invoiceMCC.routes"));
const customer_routes_1 = __importDefault(require("./web/routes/customer.routes"));
const account_routes_1 = __importDefault(require("./web/routes/account.routes")); // Note: Account routes already refactored in Wave 2
const spending_routes_1 = __importDefault(require("./web/routes/spending.routes"));
const import_routes_1 = __importDefault(require("./web/routes/import.routes"));
const activityLog_routes_1 = __importDefault(require("./web/routes/activityLog.routes"));
const creditLinking_routes_1 = __importDefault(require("./web/routes/creditLinking.routes"));
const stats_routes_1 = __importDefault(require("./web/routes/stats.routes"));
const googleAds_routes_1 = __importDefault(require("./web/routes/googleAds.routes"));
const xoy_routes_1 = __importDefault(require("./web/routes/xoy.routes"));
// Import infrastructure
const Logger_1 = require("./infrastructure/logging/Logger");
const errorHandler_1 = require("./infrastructure/middleware/errorHandler");
// Initialize Express app
const app = (0, express_1.default)();
const PORT = Number(process.env.PORT) || 3001;
// Middleware
app.use((0, helmet_1.default)({
    contentSecurityPolicy: false,
}));
// Use structured request logger
app.use(Logger_1.requestLogger);
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        const allowed = [
            'http://localhost:5173',
            'http://127.0.0.1:5173',
            'http://localhost:5174',
            'http://localhost:5175',
            process.env.FRONTEND_URL || 'http://localhost:5173',
        ];
        // The extension ID is stable because XOY has a manifest key. Authentication
        // still happens with the license/session token; this only permits browser CORS.
        if (!origin || allowed.includes(origin) || origin === `chrome-extension://${process.env.XOY_EXTENSION_ID || ''}`) {
            return callback(null, true);
        }
        return callback(new Error('CORS origin is not allowed'));
    },
    credentials: true,
}));
app.use((0, morgan_1.default)('dev'));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Health check with logic
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV,
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});
// Routes
app.use('/api/auth', auth_routes_1.default);
app.use('/api/users', user_routes_1.default);
app.use('/api/partners', partner_routes_1.default);
app.use('/api/batches', batch_routes_1.default);
app.use('/api/invoice-mccs', invoiceMCC_routes_1.default);
app.use('/api/customers', customer_routes_1.default);
app.use('/api/accounts', account_routes_1.default);
app.use('/api/spending', spending_routes_1.default);
app.use('/api/import', import_routes_1.default);
app.use('/api/activity-logs', activityLog_routes_1.default);
app.use('/api/credit-linking', creditLinking_routes_1.default);
app.use('/api/stats', stats_routes_1.default);
app.use('/api/google-ads', googleAds_routes_1.default);
app.use('/api/xoy', xoy_routes_1.default);
// Global Error Handler
app.use(errorHandler_1.errorHandler);
// 404 handler for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'Not Found' });
});
// Serve static files from the React frontend app
const frontendPath = path_1.default.join(__dirname, '../public'); // Assumes dist is copied to public in Docker
app.use(express_1.default.static(frontendPath));
// Anything that doesn't match the above, send back index.html
app.get('*', (req, res) => {
    res.sendFile(path_1.default.join(frontendPath, 'index.html'));
});
const prisma_1 = __importDefault(require("./infrastructure/database/prisma"));
async function applyDatabasePatches() {
    try {
        console.log('\n[DB] Đang chạy database patches...');
        await prisma_1.default.$executeRawUnsafe('ALTER TABLE "accounts" ALTER COLUMN "batch_id" DROP NOT NULL;');
        // Production predates Prisma migration history, so `prisma migrate deploy`
        // cannot be used until the old schema is formally baselined. Keep this
        // patch idempotent and limited to the new XOY licensing tables.
        await prisma_1.default.$executeRawUnsafe(`DO $$ BEGIN
            CREATE TYPE "XoyLicenseStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
        await prisma_1.default.$executeRawUnsafe(`DO $$ BEGIN
            CREATE TYPE "XoyDeviceStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'REVOKED');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
        await prisma_1.default.$executeRawUnsafe(`DO $$ BEGIN
            CREATE TYPE "XoyLicensePlan" AS ENUM ('BASIC', 'FULL');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
        await prisma_1.default.$executeRawUnsafe(`DO $$ BEGIN
            ALTER TYPE "XoyLicenseStatus" ADD VALUE 'ISSUED';
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
        await prisma_1.default.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "xoy_licenses" (
            "id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL,
            "telegram_id" TEXT, "key_prefix" TEXT NOT NULL, "key_hash" TEXT NOT NULL, "key_encrypted" TEXT,
            "plan" "XoyLicensePlan" NOT NULL DEFAULT 'FULL', "max_fingerprints" INTEGER NOT NULL DEFAULT 3,
            "status" "XoyLicenseStatus" NOT NULL DEFAULT 'ISSUED',
            "expires_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updated_at" TIMESTAMP(3) NOT NULL
        )`);
        await prisma_1.default.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "xoy_devices" (
            "id" TEXT NOT NULL PRIMARY KEY, "license_id" TEXT NOT NULL,
            "fingerprint" TEXT NOT NULL, "fingerprint_signals" JSONB, "extension_metadata" JSONB, "user_agent" TEXT,
            "status" "XoyDeviceStatus" NOT NULL DEFAULT 'ACTIVE',
            "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "revoked_at" TIMESTAMP(3),
            CONSTRAINT "xoy_devices_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "xoy_licenses"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )`);
        await prisma_1.default.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "xoy_licenses_key_prefix_key" ON "xoy_licenses"("key_prefix")');
        await prisma_1.default.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "xoy_licenses_key_hash_key" ON "xoy_licenses"("key_hash")');
        await prisma_1.default.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "xoy_devices_license_id_status_last_seen_at_idx" ON "xoy_devices"("license_id", "status", "last_seen_at")');
        // Version 2: a device slot belongs to a physical fingerprint; Chrome
        // profiles only own sessions beneath that fingerprint. The blocks are
        // idempotent because Railway production is patched at app startup.
        await prisma_1.default.$executeRawUnsafe('ALTER TABLE "xoy_licenses" ADD COLUMN IF NOT EXISTS "telegram_id" TEXT');
        await prisma_1.default.$executeRawUnsafe('ALTER TABLE "xoy_licenses" ADD COLUMN IF NOT EXISTS "key_encrypted" TEXT');
        await prisma_1.default.$executeRawUnsafe('ALTER TABLE "xoy_licenses" ADD COLUMN IF NOT EXISTS "plan" "XoyLicensePlan" NOT NULL DEFAULT \'FULL\'');
        await prisma_1.default.$executeRawUnsafe(`DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'xoy_licenses' AND column_name = 'max_devices')
               AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'xoy_licenses' AND column_name = 'max_fingerprints') THEN
                ALTER TABLE "xoy_licenses" RENAME COLUMN "max_devices" TO "max_fingerprints";
            END IF;
        END $$;`);
        await prisma_1.default.$executeRawUnsafe('ALTER TABLE "xoy_licenses" ALTER COLUMN "status" SET DEFAULT \'ISSUED\'');
        await prisma_1.default.$executeRawUnsafe('ALTER TABLE "xoy_licenses" DROP CONSTRAINT IF EXISTS "xoy_licenses_manager_email_key"');
        await prisma_1.default.$executeRawUnsafe('DROP INDEX IF EXISTS "xoy_licenses_manager_email_key"');
        await prisma_1.default.$executeRawUnsafe('ALTER TABLE "xoy_licenses" DROP COLUMN IF EXISTS "manager_email"');
        await prisma_1.default.$executeRawUnsafe('ALTER TABLE "xoy_licenses" DROP COLUMN IF EXISTS "manager_password_hash"');
        await prisma_1.default.$executeRawUnsafe('ALTER TABLE "xoy_devices" ADD COLUMN IF NOT EXISTS "fingerprint" TEXT');
        await prisma_1.default.$executeRawUnsafe('ALTER TABLE "xoy_devices" ADD COLUMN IF NOT EXISTS "fingerprint_signals" JSONB');
        await prisma_1.default.$executeRawUnsafe('ALTER TABLE "xoy_devices" ADD COLUMN IF NOT EXISTS "extension_metadata" JSONB');
        await prisma_1.default.$executeRawUnsafe('ALTER TABLE "xoy_devices" ADD COLUMN IF NOT EXISTS "user_agent" TEXT');
        await prisma_1.default.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "xoy_device_sessions" (
            "id" TEXT NOT NULL PRIMARY KEY, "device_id" TEXT NOT NULL, "installation_id" TEXT NOT NULL,
            "refresh_token_hash" TEXT, "refresh_expires_at" TIMESTAMP(3),
            "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "revoked_at" TIMESTAMP(3), CONSTRAINT "xoy_device_sessions_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "xoy_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )`);
        await prisma_1.default.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "xoy_device_sessions_installation_id_key" ON "xoy_device_sessions"("installation_id")');
        await prisma_1.default.$executeRawUnsafe(`DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'xoy_devices' AND column_name = 'installation_id') THEN
                INSERT INTO "xoy_device_sessions" ("id", "device_id", "installation_id", "refresh_token_hash", "refresh_expires_at", "first_seen_at", "last_seen_at", "revoked_at")
                SELECT md5('xoy-session:' || "id"), "id", "installation_id", "refresh_token_hash", "refresh_expires_at", "first_seen_at", "last_seen_at", "revoked_at"
                FROM "xoy_devices" ON CONFLICT ("installation_id") DO NOTHING;
            END IF;
        END $$;`);
        await prisma_1.default.$executeRawUnsafe('UPDATE "xoy_devices" SET "fingerprint" = \'legacy:\' || "id" WHERE "fingerprint" IS NULL');
        await prisma_1.default.$executeRawUnsafe('ALTER TABLE "xoy_devices" ALTER COLUMN "fingerprint" SET NOT NULL');
        await prisma_1.default.$executeRawUnsafe('ALTER TABLE "xoy_devices" DROP CONSTRAINT IF EXISTS "xoy_devices_license_id_installation_id_key"');
        await prisma_1.default.$executeRawUnsafe('DROP INDEX IF EXISTS "xoy_devices_license_id_installation_id_key"');
        await prisma_1.default.$executeRawUnsafe('ALTER TABLE "xoy_devices" DROP COLUMN IF EXISTS "installation_id"');
        await prisma_1.default.$executeRawUnsafe('ALTER TABLE "xoy_devices" DROP COLUMN IF EXISTS "display_name"');
        await prisma_1.default.$executeRawUnsafe('ALTER TABLE "xoy_devices" DROP COLUMN IF EXISTS "extension_version"');
        await prisma_1.default.$executeRawUnsafe('ALTER TABLE "xoy_devices" DROP COLUMN IF EXISTS "refresh_token_hash"');
        await prisma_1.default.$executeRawUnsafe('ALTER TABLE "xoy_devices" DROP COLUMN IF EXISTS "refresh_expires_at"');
        await prisma_1.default.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "xoy_devices_license_id_fingerprint_key" ON "xoy_devices"("license_id", "fingerprint")');
        await prisma_1.default.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "xoy_device_sessions_device_id_last_seen_at_idx" ON "xoy_device_sessions"("device_id", "last_seen_at")');
        await prisma_1.default.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "xoy_support_log_runs" (
            "id" TEXT NOT NULL PRIMARY KEY, "device_id" TEXT NOT NULL, "run_id" TEXT NOT NULL,
            "support_id" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updated_at" TIMESTAMP(3) NOT NULL,
            CONSTRAINT "xoy_support_log_runs_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "xoy_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )`);
        await prisma_1.default.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "xoy_support_log_events" (
            "id" TEXT NOT NULL PRIMARY KEY, "run_db_id" TEXT NOT NULL, "event_id" TEXT NOT NULL,
            "occurred_at" TIMESTAMP(3) NOT NULL, "trace_id" TEXT, "job_id" TEXT, "job_type" TEXT,
            "success" BOOLEAN, "text" TEXT NOT NULL, "file_line" TEXT, "display_time" TEXT,
            "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "xoy_support_log_events_run_db_id_fkey" FOREIGN KEY ("run_db_id") REFERENCES "xoy_support_log_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )`);
        await prisma_1.default.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "xoy_support_log_runs_support_id_key" ON "xoy_support_log_runs"("support_id")');
        await prisma_1.default.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "xoy_support_log_runs_device_id_run_id_key" ON "xoy_support_log_runs"("device_id", "run_id")');
        await prisma_1.default.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "xoy_support_log_runs_device_id_created_at_idx" ON "xoy_support_log_runs"("device_id", "created_at")');
        await prisma_1.default.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "xoy_support_log_events_run_db_id_event_id_key" ON "xoy_support_log_events"("run_db_id", "event_id")');
        await prisma_1.default.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "xoy_support_log_events_run_db_id_occurred_at_idx" ON "xoy_support_log_events"("run_db_id", "occurred_at")');
        await prisma_1.default.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "xoy_support_log_events_trace_id_idx" ON "xoy_support_log_events"("trace_id")');
        console.log('[DB] Database patches applied.\n');
    }
    catch (err) {
        // Only log if it's a real error, if it's already dropped it might or might not error
        console.error('[DB] Lỗi khi chạy database patches:', err.message);
    }
}
applyDatabasePatches();
// Bind explicitly to 0.0.0.0
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Ads Core System running on http://0.0.0.0:${PORT}`);
    console.log(`🛠️ Health: http://0.0.0.0:${PORT}/api/health`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
});
exports.default = app;
//# sourceMappingURL=index.js.map