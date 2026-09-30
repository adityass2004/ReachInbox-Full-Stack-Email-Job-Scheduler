import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { slackController } from '../controllers/slack.controller.js';

export const slackRouter: Router = Router();

slackRouter.get('/connect', authenticate, (req, res, next) => {
    slackController.connect(req, res, next);
});

slackRouter.get('/callback', (req, res, next) => {
    slackController.callback(req, res, next);
});

slackRouter.post('/disconnect', authenticate, (req, res, next) => {
    slackController.disconnect(req, res, next);
});

slackRouter.delete('/', authenticate, (req, res, next) => {
    slackController.disconnect(req, res, next);
});

slackRouter.delete('/disconnect', authenticate, (req, res, next) => {
    slackController.disconnect(req, res, next);
});

slackRouter.get('/status', authenticate, (req, res, next) => {
    slackController.status(req, res, next);
});