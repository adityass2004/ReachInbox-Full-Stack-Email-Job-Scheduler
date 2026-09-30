import { Router } from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { getEmailQueue } from '@reachinbox/shared';
import { authenticate } from '../middleware/auth.js';
import { authorizeQueueAdmin } from '../middleware/queue-admin.js';

let boardRouter: Router | undefined;

function getBoardRouter(): Router {
    if (!boardRouter) {
        const serverAdapter = new ExpressAdapter();
        serverAdapter.setBasePath('/admin/queues');

        createBullBoard({
            queues: [new BullMQAdapter(getEmailQueue())],
            serverAdapter,
        });
        const router = serverAdapter.getRouter();
        boardRouter = router;
        return router;
    }

    return boardRouter;
}

export const bullBoardRouter: Router = Router();
bullBoardRouter.use(authenticate, authorizeQueueAdmin);
bullBoardRouter.use((req, res, next) => {
    try {
        getBoardRouter()(req, res, next);
    } catch (error) {
        next(error);
    }
});