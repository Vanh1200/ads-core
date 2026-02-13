// Re-export existing auth middleware from infrastructure layer
export {
    authenticateToken,
    AuthRequest,
    requireRole,
    isAdmin,
    isBuyer,
    isLinker,
    isAssigner,
    isUpdater,
    canView,
} from '../../middleware/auth.middleware';
