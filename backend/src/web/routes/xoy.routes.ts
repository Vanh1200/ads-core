import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { asyncHandler } from '../../infrastructure/middleware/errorHandler';
import { xoyLicenseService } from '../../application/services/XoyLicenseService';
import { xoySupportLogService } from '../../application/services/XoySupportLogService';
import { authenticateToken, isAdmin } from '../../infrastructure/middleware/auth';

const router = Router();
const secret = () => process.env.XOY_JWT_SECRET || process.env.JWT_SECRET || 'change-me-in-production';

function requireScope(scope: 'xoy-device') {
    return (req: any, _res: any, next: any) => {
        try {
            const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
            const payload = jwt.verify(token || '', secret()) as any;
            if (payload.scope !== scope) throw new Error('FORBIDDEN');
            req.xoyAuth = payload;
            next();
        } catch (error) { next(error); }
    };
}

router.post('/activate', asyncHandler(async (req, res) => {
    res.json(await xoyLicenseService.activate(req.body));
}));
router.post('/admin/licenses', authenticateToken, isAdmin, asyncHandler(async (req, res) => {
    res.status(201).json(await xoyLicenseService.createLicense(req.body));
}));
router.get('/admin/licenses', authenticateToken, isAdmin, asyncHandler(async (_req, res) => {
    res.json(await xoyLicenseService.listLicenses());
}));
router.post('/session/refresh', asyncHandler(async (req, res) => {
    res.json(await xoyLicenseService.refresh(req.body));
}));
router.post('/heartbeat', requireScope('xoy-device'), asyncHandler(async (req: any, res) => {
    res.json(await xoyLicenseService.heartbeat(req.xoyAuth.deviceId, req.xoyAuth.sessionId));
}));
router.get('/entitlement', requireScope('xoy-device'), asyncHandler(async (req: any, res) => {
    res.json(await xoyLicenseService.getEntitlement(req.xoyAuth.deviceId, req.xoyAuth.sessionId));
}));
router.post('/support/logs/batches', requireScope('xoy-device'), asyncHandler(async (req: any, res) => {
    // A signed token may still exist briefly after a device is revoked. Check
    // current device/license state before accepting diagnostic data.
    await xoyLicenseService.getEntitlement(req.xoyAuth.deviceId, req.xoyAuth.sessionId);
    res.json(await xoySupportLogService.ingest(req.xoyAuth.deviceId, req.body));
}));
router.get('/admin/licenses/:licenseId/key', authenticateToken, isAdmin, asyncHandler(async (req, res) => {
    res.json(await xoyLicenseService.getLicenseKey(req.params.licenseId));
}));
router.get('/admin/licenses/:licenseId/devices', authenticateToken, isAdmin, asyncHandler(async (req, res) => {
    res.json(await xoyLicenseService.listDevices(req.params.licenseId));
}));
router.delete('/admin/licenses/:licenseId/devices/:deviceId', authenticateToken, isAdmin, asyncHandler(async (req, res) => {
    await xoyLicenseService.revokeDevice(req.params.licenseId, req.params.deviceId);
    res.status(204).end();
}));
router.get('/admin/support-logs', authenticateToken, isAdmin, asyncHandler(async (req, res) => {
    res.json(await xoySupportLogService.list(req.query));
}));
router.get('/admin/licenses/:licenseId/support-logs', authenticateToken, isAdmin, asyncHandler(async (req, res) => {
    res.json(await xoySupportLogService.listByLicense(req.params.licenseId, req.query));
}));
router.get('/admin/support-logs/:supportId', authenticateToken, isAdmin, asyncHandler(async (req, res) => {
    res.json(await xoySupportLogService.getBySupportId(req.params.supportId));
}));

export default router;
