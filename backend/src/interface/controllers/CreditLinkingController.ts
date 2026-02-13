import { Response } from 'express';
import { AuthRequest } from '../../infrastructure/middleware/auth';
import { creditLinkingService } from '../../application/services/CreditLinkingService';
import { asyncHandler } from '../../infrastructure/middleware/errorHandler';

export class CreditLinkingController {
    suggest = asyncHandler(async (req: any, res: any) => {
        const { requirements } = req.body;
        const suggestions = await creditLinkingService.suggest(requirements);
        res.json(suggestions);
    });

    execute = asyncHandler(async (req: any, res: any) => {
        const { links, invoiceMccId, newInvoiceMcc } = req.body;
        const result = await creditLinkingService.execute(links, invoiceMccId, newInvoiceMcc, req.user!.id, req.ip);
        res.json(result);
    });
}

export const creditLinkingController = new CreditLinkingController();
