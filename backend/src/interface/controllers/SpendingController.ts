import { Response } from 'express';
import { AuthRequest } from '../../infrastructure/middleware/auth';
import { spendingService } from '../../application/services/SpendingService';
import { paginationSchema } from '../../interface/validators';
import { asyncHandler } from '../../infrastructure/middleware/errorHandler';

export class SpendingController {
    listSnapshots = asyncHandler(async (req: any, res: any) => {
        const query = paginationSchema.safeParse(req.query);
        const { page, limit } = query.success ? query.data : { page: 1, limit: 50 };
        const { accountId, date } = req.query;
        const result = await spendingService.listSnapshots({
            page,
            limit,
            accountId: accountId as string,
            date: date as string
        });
        res.json(result);
    });

    createSnapshot = asyncHandler(async (req: any, res: any) => {
        const snapshot = await spendingService.createSnapshot(req.body);
        res.status(201).json(snapshot);
    });

    calculateRecords = asyncHandler(async (req: any, res: any) => {
        const { accountId, spendingDate } = req.body;
        const result = await spendingService.calculateRecords(accountId, spendingDate);
        res.json(result);
    });

    getRecords = asyncHandler(async (req: any, res: any) => {
        const { accountId, miId, mcId, startDate, endDate } = req.query;
        // logic for getRecords was simple prisma call usually, 
        // but for consistency let's assume it's in service or just keep it thin
        const result = await spendingService.getSummary({ accountId, miId, mcId, startDate, endDate });
        res.json(result);
    });

    getCustomerSummary = asyncHandler(async (req: any, res: any) => {
        const { startDate, endDate } = req.query;
        const result = await spendingService.getSummary({
            type: 'customer',
            id: req.params.id,
            startDate,
            endDate
        });
        res.json(result);
    });

    getInvoiceMCCSummary = asyncHandler(async (req: any, res: any) => {
        const { startDate, endDate } = req.query;
        const result = await spendingService.getSummary({
            type: 'invoice-mcc',
            id: req.params.id,
            startDate,
            endDate
        });
        res.json(result);
    });

    getBatchSummary = asyncHandler(async (req: any, res: any) => {
        const { startDate, endDate } = req.query;
        const result = await spendingService.getSummary({
            type: 'batch',
            id: req.params.id,
            startDate,
            endDate
        });
        res.json(result);
    });

    getAccountChart = asyncHandler(async (req: any, res: any) => {
        const { startDate, endDate } = req.query;
        const result = await spendingService.getAccountChart(
            req.params.id,
            startDate as string,
            endDate as string
        );
        res.json(result);
    });

    getGlobalChart = asyncHandler(async (req: any, res: any) => {
        const { days, startDate, endDate } = req.query;
        const result = await spendingService.getGlobalChart(
            days ? parseInt(days as string) : undefined,
            startDate as string,
            endDate as string
        );
        res.json(result);
    });
}

export const spendingController = new SpendingController();
