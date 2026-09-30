import { Router } from 'express';
import { getEmailQueue } from '@reachinbox/shared';

export const queueRouter: Router = Router();

// GET /api/queue/stats - Live BullMQ job metrics
queueRouter.get('/stats', async (_req, res, next) => {
  try {
    const queue = getEmailQueue();
    const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused');
    res.status(200).json({
      success: true,
      data: {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
        paused: counts.paused ?? 0,
        total: (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0) + (counts.completed ?? 0),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/queue/jobs - Inspect jobs by status (e.g. ?status=delayed)
queueRouter.get('/jobs', async (req, res, next) => {
  try {
    const status = (req.query.status as string) || 'delayed';
    const queue = getEmailQueue();
    const validStatuses: Array<'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'paused'> = [
      'waiting', 'active', 'completed', 'failed', 'delayed', 'paused',
    ];
    const targetStatus = validStatuses.includes(status as any) ? (status as any) : 'delayed';
    const jobs = await queue.getJobs([targetStatus], 0, 50, true);
    res.status(200).json({
      success: true,
      data: jobs.map((job) => ({
        id: job.id,
        name: job.name,
        data: job.data,
        delay: job.delay,
        timestamp: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        failedReason: job.failedReason,
      })),
    });
  } catch (error) {
    next(error);
  }
});
