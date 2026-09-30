import { prisma } from '@reachinbox/shared';

export class SenderService {
    async listForUser(userId: string) {
        return prisma.sender.findMany({
            where: { userId, active: true },
            select: { id: true, email: true, displayName: true },
            orderBy: { email: 'asc' },
        });
    }
}

export const senderService = new SenderService();