import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

// Import routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import partnerRoutes from './routes/partner.routes';
import batchRoutes from './routes/batch.routes';
import invoiceMCCRoutes from './routes/invoiceMCC.routes';
import customerRoutes from './routes/customer.routes';
import accountRoutes from './routes/account.routes';
import spendingRoutes from './routes/spending.routes';
import importRoutes from './routes/import.routes';
import activityLogRoutes from './routes/activityLog.routes';
import creditLinkingRoutes from './routes/creditLinking.routes';
import dashboardRoutes from './routes/dashboard.routes';

const app = express();
const PORT = Number(process.env.PORT || 3001);

// Middleware
app.use(helmet({
    contentSecurityPolicy: false,
}));
app.use(cors({
    origin: [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:5175',
        process.env.FRONTEND_URL || 'http://localhost:5173'
    ],
    credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
app.use('/api/dashboard', dashboardRoutes);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err.stack);
    res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// 404 handler
// 404 handler for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'Not Found' });
});

// Serve static files from the React frontend app
import path from 'path';
const frontendPath = path.join(__dirname, '../public'); // Assumes dist is copied to public in Docker
app.use(express.static(frontendPath));

// Anything that doesn't match the above, send back index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// Global Error Handlers - Log everything before crash
process.on('unhandledRejection', (reason, promise) => {
    console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('CRITICAL: Uncaught Exception:', error);
    process.exit(1);
});

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
    console.log(`📊 Health check: http://0.0.0.0:${PORT}/api/health`);
});

server.keepAliveTimeout = 65000; // Ensure connection survives longer
server.headersTimeout = 66000;

export default app;
