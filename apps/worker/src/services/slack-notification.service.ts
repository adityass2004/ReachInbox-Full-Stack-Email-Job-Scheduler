import { randomUUID } from "node:crypto";
import {
    decryptSlackToken,
    getSharedRedisConnection,
    prisma,
} from "@reachinbox/shared";
import { config } from "../config/env.js";
import { logger } from "../logger.js";

export interface SlackRateLimitNotification {
    userId: string;
    senderId: string;
    senderEmail: string;
    limit: number;
    emailJobId: string;
    hourWindow: string;
    nextWindow: Date;
}

export interface SlackNotificationConnection {
    active: boolean;
    encryptedToken: string;
    channelId: string | null;
}

export interface SlackNotificationDependencies {
    getConnection(userId: string): Promise<SlackNotificationConnection | null>;
    claimEvent(key: string): Promise<boolean>;
    postMessage(token: string, channelId: string, text: string): Promise<void>;
}

export function slackRateLimitDedupeKey(
    senderId: string,
    hourWindow: string,
): string {
    return `slack-rate-limit-notified:${senderId}:${hourWindow}`;
}

export function formatSlackRateLimitMessage(
    notification: SlackRateLimitNotification,
): string {
    return `Sender ${notification.senderEmail} reached hourly limit (${notification.limit}). Job ${notification.emailJobId} rescheduled to ${notification.nextWindow.toISOString()}.`;
}

const defaultDependencies: SlackNotificationDependencies = {
    async getConnection(userId) {
        return prisma.slackConnection.findUnique({
            where: { userId },
            select: { active: true, encryptedToken: true, channelId: true },
        });
    },
    async claimEvent(key) {
        const result = await getSharedRedisConnection().set(key, randomUUID(), "EX", 7200, "NX");
        return result === "OK";
    },
    async postMessage(token, channelId, text) {
        let response: Response;
        try {
            response = await fetch("https://slack.com/api/chat.postMessage", {
                method: "POST",
                headers: {
                    authorization: `Bearer ${token}`,
                    "content-type": "application/json; charset=utf-8",
                },
                body: JSON.stringify({ channel: channelId, text }),
                signal: AbortSignal.timeout(8_000),
            });
        } catch {
            throw new Error("Slack request failed");
        }

        if (!response.ok) throw new Error("Slack request failed");

        let payload: unknown;
        try {
            payload = await response.json();
        } catch {
            throw new Error("Slack returned an invalid response");
        }

        if (!payload || typeof payload !== "object" || !("ok" in payload) || payload.ok !== true) {
            throw new Error("Slack rejected the notification");
        }
    },
};

export async function notifySlackRateLimit(
    notification: SlackRateLimitNotification,
    dependencies: SlackNotificationDependencies = defaultDependencies,
): Promise<void> {
    try {
        const connection = await dependencies.getConnection(notification.userId);
        if (!connection?.active) return;

        const channelId = connection.channelId || config.slackNotificationChannelId;
        if (!channelId) {
            logger.warn(
                "SLACK_NOTIFICATION_SKIPPED",
                "Slack connection has no notification channel configured",
                { userId: notification.userId, senderId: notification.senderId },
            );
            return;
        }

        const claimed = await dependencies.claimEvent(
            slackRateLimitDedupeKey(notification.senderId, notification.hourWindow),
        );
        if (!claimed) return;

        await dependencies.postMessage(
            decryptSlackToken(connection.encryptedToken),
            channelId,
            formatSlackRateLimitMessage(notification),
        );
        logger.info("SLACK_NOTIFICATION_SENT", "Slack rate-limit notification sent", {
            userId: notification.userId,
            senderId: notification.senderId,
            emailJobId: notification.emailJobId,
            hourWindow: notification.hourWindow,
        });
    } catch (error) {
        logger.warn("SLACK_NOTIFICATION_FAILED", "Slack notification failed; email remains rescheduled", {
            userId: notification.userId,
            senderId: notification.senderId,
            emailJobId: notification.emailJobId,
            error: error instanceof Error ? error.message : "Unknown Slack notification error",
        });
    }
}