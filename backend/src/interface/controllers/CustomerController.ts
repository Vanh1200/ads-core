import { Response } from 'express';
import { AuthRequest } from '../../infrastructure/middleware/auth';
import { customerService } from '../../application/services/CustomerService';
import { spendingService } from '../../application/services/SpendingService';
import { paginationSchema } from '../../interface/validators';
import { asyncHandler } from '../../infrastructure/middleware/errorHandler';
import { formatPaginationResponse } from '../../utils/pagination';
import { googleSheetsService } from '../../application/services/GoogleSheetsService';
import { format } from 'date-fns';
import prisma from '../../infrastructure/database/prisma';

export class CustomerController {
    list = asyncHandler(async (req: any, res: any) => {
        const query = paginationSchema.safeParse(req.query);
        const { page, limit, search, sortBy, sortOrder } = query.success
            ? query.data
            : { page: 1, limit: 20, search: undefined, sortBy: undefined, sortOrder: 'desc' as const };
        const { status, spendingDays } = req.query;

        let startDate: Date | undefined;
        let endDate: Date | undefined;

        if (spendingDays) {
            endDate = new Date();
            startDate = new Date();
            startDate.setDate(endDate.getDate() - Number(spendingDays));
        }

        const { data, total } = await customerService.list({
            page,
            limit,
            q: search as string,
            status: status as string,
            sortBy,
            sortOrder,
            startDate,
            endDate,
        });

        res.json(formatPaginationResponse(data, total, page, limit));
    });

    getById = asyncHandler(async (req: any, res: any) => {
        const customer = await customerService.getById(req.params.id);
        res.json(customer);
    });

    create = asyncHandler(async (req: any, res: any) => {
        const customer = await customerService.create(req.body, req.user!.id, req.ip);
        res.status(201).json(customer);
    });

    update = asyncHandler(async (req: any, res: any) => {
        const customer = await customerService.update(req.params.id, req.body, req.user!.id, req.ip);
        res.json(customer);
    });

    delete = asyncHandler(async (req: any, res: any) => {
        const result = await customerService.delete(req.params.id, req.user!.id, req.ip);
        res.json(result);
    });

    assignAccounts = asyncHandler(async (req: any, res: any) => {
        const { accountIds } = req.body;
        const result = await customerService.assignAccounts(req.params.id, accountIds, req.user!.id, req.ip);
        res.json(result);
    });

    syncSheets = asyncHandler(async (req: any, res: any) => {
        const { id } = req.params;
        const { startDate, endDate } = req.body;
        
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        const results = [];
        // Loop through dates
        let current = new Date(start);
        while (current <= end) {
            await googleSheetsService.updateCustomerSheet(id, new Date(current));
            results.push(format(current, 'yyyy-MM-dd'));
            current.setDate(current.getDate() + 1);
        }
        
        res.json({ message: 'Sync completed', dates: results });
    });

    bulkSyncSheets = asyncHandler(async (req: any, res: any) => {
        const { customerIds, quickSync, startDate, endDate } = req.body;
        
        // Setup SSE
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        const sendLog = (message: string) => {
            res.write(`data: ${JSON.stringify({ message })}\n\n`);
        };

        let ids = customerIds || [];
        if (quickSync) {
            sendLog('🔍 Đang tìm kiếm khách hàng có phát sinh chi tiêu...');
            const customersWithSpending = await prisma.customer.findMany({
                where: {
                    accounts: {
                        some: {
                            spendingRecords: {
                                some: {
                                    spendingDate: {
                                        gte: new Date(startDate),
                                        lte: new Date(endDate)
                                    }
                                }
                            }
                        }
                    }
                },
                select: { id: true }
            });
            ids = customersWithSpending.map(c => c.id);
            sendLog(`✅ Tìm thấy ${ids.length} khách hàng.`);
        }

        const start = new Date(startDate);
        const end = new Date(endDate);

        for (const id of ids) {
            let current = new Date(start);
            while (current <= end) {
                await googleSheetsService.updateCustomerSheet(id, new Date(current), (msg) => {
                    sendLog(msg);
                });
                current.setDate(current.getDate() + 1);
            }
        }

        sendLog('🎉 Tất cả đã hoàn thành!');
        res.write('event: end\ndata: {}\n\n');
        res.end();
    });
}

export const customerController = new CustomerController();
