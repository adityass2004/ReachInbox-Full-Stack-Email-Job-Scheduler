import { Router, Request, Response } from 'express';
import { HealthCheckResponse } from '@reachinbox/shared';
import { config } from '../config/env.js';

export const healthRouter: Router = Router();

healthRouter.get('/health', (_req: Request, res: Response) => {
  const healthResponse: HealthCheckResponse = {
    status: 'ok',
    service: config.serviceName,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    version: config.version,
  };

  res.status(200).json(healthResponse);
});
