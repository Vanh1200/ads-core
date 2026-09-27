import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { asyncHandler } from '../../infrastructure/middleware/errorHandler';
import { xoyLicenseService } from '../../application/services/XoyLicenseService';
import { authenticateToken, isAdmin } from '../../infrastructure/middleware/auth';

const router = Router();
const secret = () => process.env.XOY_JWT_SECRET || process.env.JWT_SECRET || 'change-me-in-production';

function requireScope(scope: 'xoy-device' | 'xoy-manager') {
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
    res.json(await xoyLicenseService.heartbeat(req.xoyAuth.deviceId));
}));
router.get('/entitlement', requireScope('xoy-device'), asyncHandler(async (req: any, res) => {
    res.json(await xoyLicenseService.getEntitlement(req.xoyAuth.deviceId));
}));
router.post('/manager/login', asyncHandler(async (req, res) => {
    res.json(await xoyLicenseService.managerLogin(req.body.email || '', req.body.password || ''));
}));
router.get('/manager/devices', requireScope('xoy-manager'), asyncHandler(async (req: any, res) => {
    res.json(await xoyLicenseService.listDevices(req.xoyAuth.licenseId));
}));
router.delete('/manager/devices/:deviceId', requireScope('xoy-manager'), asyncHandler(async (req: any, res) => {
    await xoyLicenseService.revokeDevice(req.xoyAuth.licenseId, req.params.deviceId);
    res.status(204).end();
}));

export default router;
