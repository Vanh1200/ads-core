"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
// Import routes
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const user_routes_1 = __importDefault(require("./routes/user.routes"));
const partner_routes_1 = __importDefault(require("./routes/partner.routes"));
const batch_routes_1 = __importDefault(require("./routes/batch.routes"));
const invoiceMCC_routes_1 = __importDefault(require("./routes/invoiceMCC.routes"));
const customer_routes_1 = __importDefault(require("./routes/customer.routes"));
const account_routes_1 = __importDefault(require("./routes/account.routes"));
const spending_routes_1 = __importDefault(require("./routes/spending.routes"));
const import_routes_1 = __importDefault(require("./routes/import.routes"));
const activityLog_routes_1 = __importDefault(require("./routes/activityLog.routes"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
// Middleware
app.use((0, helmet_1.default)());
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
// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});
// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not Found' });
});
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
});
exports.default = app;
//# sourceMappingURL=index.js.map