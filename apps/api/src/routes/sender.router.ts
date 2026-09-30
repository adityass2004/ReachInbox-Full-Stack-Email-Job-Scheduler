import { Router } from 'express';
import { senderController } from '../controllers/sender.controller.js';
import { authenticate } from '../middleware/auth.js';

export const senderRouter: Router = Router();

senderRouter.get('/', authenticate, (req, res, next) => {
    senderController.list(req, res, next);
});