import { Response } from 'express';
import multer from 'multer';
import { AuthRequest } from '../../infrastructure/middleware/auth';
import { importService } from '../../application/services/ImportService';
import { asyncHandler } from '../../infrastructure/middleware/errorHandler';

export const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            file.mimetype === 'application/vnd.ms-excel' ||
            file.originalname.endsWith('.xlsx') ||
            file.originalname.endsWith('.xls')) {
            cb(null, true);
        } else {
            cb(new Error('Only Excel files are allowed'));
        }
    },
});

export class ImportController {
    importAccounts = asyncHandler(async (req: any, res: any) => {
        if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
        const { batchId } = req.body;
        if (!batchId) { res.status(400).json({ error: 'Batch ID is required' }); return; }
        const result = await importService.importAccounts(req.file.buffer, batchId, req.user!.id, req.ip);
        res.json(result);
    });

    parseBatch = asyncHandler(async (req: any, res: any) => {
        if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
        const result = await importService.parseBatch(req.file.buffer);
        res.json(result);
    });

    createBatchWithAccounts = asyncHandler(async (req: any, res: any) => {
        const result = await importService.createBatchWithAccounts(req.body, req.user!.id, req.ip);
        res.json(result);
    });

    previewSpending = asyncHandler(async (req: any, res: any) => {
        if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
        const result = await importService.previewSpending(req.file.buffer);
        res.json(result);
    });

    confirmSpending = asyncHandler(async (req: any, res: any) => {
        const result = await importService.confirmSpending(req.body, req.user!.id, req.ip);
        res.json(result);
    });
}

export const importController = new ImportController();
