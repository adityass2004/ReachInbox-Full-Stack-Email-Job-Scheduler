import { Router } from 'express';
import { healthRouter } from './health.js';
import { emailRouter } from './email.router.js';
import { slackRouter } from './slack.router.js';
import { authRouter } from './auth.router.js';
import { senderRouter } from './sender.router.js';

export const apiRouter: Router = Router();

// Mount health check routes
apiRouter.use(healthRouter);

// Google OAuth and session routes
apiRouter.use('/auth', authRouter);

// Mount email scheduling and query routes
apiRouter.use('/emails', emailRouter);

apiRouter.use('/senders', senderRouter);

// Slack workspace connection routes
apiRouter.use('/integrations/slack', slackRouter);
