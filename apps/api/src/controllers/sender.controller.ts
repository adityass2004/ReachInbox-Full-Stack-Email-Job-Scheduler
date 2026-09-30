import { NextFunction, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { senderService } from '../services/sender.service.js';

export const senderController = {
    async list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const senders = await senderService.listForUser(req.user!.id);
            res.status(200).json({ success: true, data: { items: senders } });
        } catch (error) {
            next(error);
        }
    },
};