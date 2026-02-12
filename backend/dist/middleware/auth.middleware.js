"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.canView = exports.isUpdater = exports.isAssigner = exports.isLinker = exports.isBuyer = exports.isAdmin = exports.requireRole = exports.authenticateToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    if (!token) {
        res.status(401).json({ error: 'Access token required' });
        return;
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'secret');
        req.user = decoded;
        next();
    }
    catch (error) {
        res.status(403).json({ error: 'Invalid or expired token' });
    }
};
exports.authenticateToken = authenticateToken;
// Role-based access control middleware
const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }
        if (!roles.includes(req.user.role)) {
            res.status(403).json({ error: 'Insufficient permissions' });
            return;
        }
        next();
    };
};
exports.requireRole = requireRole;
// Specific role checks
exports.isAdmin = (0, exports.requireRole)('ADMIN');
exports.isBuyer = (0, exports.requireRole)('ADMIN', 'MANAGER', 'BUYER');
exports.isLinker = (0, exports.requireRole)('ADMIN', 'MANAGER', 'LINKER');
exports.isAssigner = (0, exports.requireRole)('ADMIN', 'MANAGER', 'ASSIGNER');
exports.isUpdater = (0, exports.requireRole)('ADMIN', 'MANAGER', 'UPDATER');
exports.canView = (0, exports.requireRole)('ADMIN', 'MANAGER', 'BUYER', 'LINKER', 'ASSIGNER', 'UPDATER', 'VIEWER');
//# sourceMappingURL=auth.middleware.js.map