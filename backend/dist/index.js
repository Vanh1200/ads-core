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
// Import infrastructure
const Logger_1 = require("./infrastructure/logging/Logger");
const errorHandler_1 = require("./infrastructure/middleware/errorHandler");
const app = (0, express_1.default)();
const PORT = Number(process.env.PORT) || 3001;
// Middleware
app.use((0, helmet_1.default)({
    contentSecurityPolicy: false,
}));
// Use structured request logger
app.use(Logger_1.requestLogger);
app.use((0, cors_1.default)({
    origin: [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:5175',
        process.env.FRONTEND_URL || 'http://localhost:5173'
    ],
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
// Bind explicitly to 0.0.0.0
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Ads Core System running on http://0.0.0.0:${PORT}`);
    console.log(`🛠️ Health: http://0.0.0.0:${PORT}/api/health`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
});
exports.default = app;
//# sourceMappingURL=index.js.map