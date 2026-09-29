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

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

// Import new routes (Clean Architecture)
import authRoutes from './web/routes/auth.routes';
import userRoutes from './web/routes/user.routes';
import partnerRoutes from './web/routes/partner.routes';
import batchRoutes from './web/routes/batch.routes';
import invoiceMCCRoutes from './web/routes/invoiceMCC.routes';
import customerRoutes from './web/routes/customer.routes';
import accountRoutes from './web/routes/account.routes'; // Note: Account routes already refactored in Wave 2
import spendingRoutes from './web/routes/spending.routes';
import importRoutes from './web/routes/import.routes';
import activityLogRoutes from './web/routes/activityLog.routes';
import creditLinkingRoutes from './web/routes/creditLinking.routes';
import statsRoutes from './web/routes/stats.routes';
import googleAdsRoutes from './web/routes/googleAds.routes';
import xoyRoutes from './web/routes/xoy.routes';

// Import infrastructure
import { requestLogger } from './infrastructure/logging/Logger';
import { errorHandler } from './infrastructure/middleware/errorHandler';

// Initialize Express app
const app = express();
const PORT = Number(process.env.PORT) || 3001;


// Middleware
app.use(helmet({
    contentSecurityPolicy: false,
}));

// Use structured request logger
app.use(requestLogger);

app.use(cors({
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
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/partners', partnerRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/invoice-mccs', invoiceMCCRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/spending', spendingRoutes);
app.use('/api/import', importRoutes);
app.use('/api/activity-logs', activityLogRoutes);
app.use('/api/credit-linking', creditLinkingRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/google-ads', googleAdsRoutes);
app.use('/api/xoy', xoyRoutes);

// Global Error Handler
app.use(errorHandler);

// 404 handler for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'Not Found' });
});

// Serve static files from the React frontend app
const frontendPath = path.join(__dirname, '../public'); // Assumes dist is copied to public in Docker
app.use(express.static(frontendPath));

// Anything that doesn't match the above, send back index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

import prisma from './infrastructure/database/prisma';

async function applyDatabasePatches() {
    try {
        console.log('\n[DB] Đang chạy database patches...');
        await prisma.$executeRawUnsafe('ALTER TABLE "accounts" ALTER COLUMN "batch_id" DROP NOT NULL;');
        // Production predates Prisma migration history, so `prisma migrate deploy`
        // cannot be used until the old schema is formally baselined. Keep this
        // patch idempotent and limited to the new XOY licensing tables.
        await prisma.$executeRawUnsafe(`DO $$ BEGIN
            CREATE TYPE "XoyLicenseStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
        await prisma.$executeRawUnsafe(`DO $$ BEGIN
            CREATE TYPE "XoyDeviceStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'REVOKED');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
        await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "xoy_licenses" (
            "id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL,
            "key_prefix" TEXT NOT NULL, "key_hash" TEXT NOT NULL,
            "manager_email" TEXT NOT NULL, "manager_password_hash" TEXT NOT NULL,
            "max_devices" INTEGER NOT NULL DEFAULT 3,
            "status" "XoyLicenseStatus" NOT NULL DEFAULT 'ACTIVE',
            "expires_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updated_at" TIMESTAMP(3) NOT NULL
        )`);
        await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "xoy_devices" (
            "id" TEXT NOT NULL PRIMARY KEY, "license_id" TEXT NOT NULL,
            "installation_id" TEXT NOT NULL, "display_name" TEXT NOT NULL DEFAULT 'Chrome profile',
            "extension_version" TEXT, "status" "XoyDeviceStatus" NOT NULL DEFAULT 'ACTIVE',
            "refresh_token_hash" TEXT, "refresh_expires_at" TIMESTAMP(3),
            "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "revoked_at" TIMESTAMP(3),
            CONSTRAINT "xoy_devices_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "xoy_licenses"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )`);
        await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "xoy_licenses_key_prefix_key" ON "xoy_licenses"("key_prefix")');
        await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "xoy_licenses_key_hash_key" ON "xoy_licenses"("key_hash")');
        await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "xoy_licenses_manager_email_key" ON "xoy_licenses"("manager_email")');
        await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "xoy_devices_license_id_installation_id_key" ON "xoy_devices"("license_id", "installation_id")');
        await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "xoy_devices_license_id_status_last_seen_at_idx" ON "xoy_devices"("license_id", "status", "last_seen_at")');
        await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "xoy_support_log_runs" (
            "id" TEXT NOT NULL PRIMARY KEY, "device_id" TEXT NOT NULL, "run_id" TEXT NOT NULL,
            "support_id" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updated_at" TIMESTAMP(3) NOT NULL,
            CONSTRAINT "xoy_support_log_runs_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "xoy_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )`);
        await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "xoy_support_log_events" (
            "id" TEXT NOT NULL PRIMARY KEY, "run_db_id" TEXT NOT NULL, "event_id" TEXT NOT NULL,
            "occurred_at" TIMESTAMP(3) NOT NULL, "trace_id" TEXT, "job_id" TEXT, "job_type" TEXT,
            "success" BOOLEAN, "text" TEXT NOT NULL, "file_line" TEXT, "display_time" TEXT,
            "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "xoy_support_log_events_run_db_id_fkey" FOREIGN KEY ("run_db_id") REFERENCES "xoy_support_log_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )`);
        await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "xoy_support_log_runs_support_id_key" ON "xoy_support_log_runs"("support_id")');
        await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "xoy_support_log_runs_device_id_run_id_key" ON "xoy_support_log_runs"("device_id", "run_id")');
        await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "xoy_support_log_runs_device_id_created_at_idx" ON "xoy_support_log_runs"("device_id", "created_at")');
        await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "xoy_support_log_events_run_db_id_event_id_key" ON "xoy_support_log_events"("run_db_id", "event_id")');
        await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "xoy_support_log_events_run_db_id_occurred_at_idx" ON "xoy_support_log_events"("run_db_id", "occurred_at")');
        await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "xoy_support_log_events_trace_id_idx" ON "xoy_support_log_events"("trace_id")');
        console.log('[DB] Database patches applied.\n');
    } catch (err: any) {
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

export default app;
