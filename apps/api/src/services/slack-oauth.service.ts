import { z } from 'zod';

const slackTokenResponseSchema = z.object({
    ok: z.literal(true),
    access_token: z.string().min(1),
    team: z.object({
        id: z.string().min(1),
        name: z.string().optional(),
    }),
});

export class SlackProviderError extends Error { }

export async function exchangeSlackAuthorizationCode(code: string): Promise<{
    accessToken: string;
    teamId: string;
    teamName: string | null;
}> {
    let response: Response;
    try {
        response = await fetch('https://slack.com/api/oauth.v2.access', {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: process.env.SLACK_CLIENT_ID || '',
                client_secret: process.env.SLACK_CLIENT_SECRET || '',
                code,
                redirect_uri: process.env.SLACK_REDIRECT_URI || '',
            }),
            signal: AbortSignal.timeout(10_000),
        });
    } catch {
        throw new SlackProviderError('Slack authorization could not be completed');
    }

    if (!response.ok) {
        throw new SlackProviderError('Slack authorization could not be completed');
    }

    let payload: unknown;
    try {
        payload = await response.json();
    } catch {
        throw new SlackProviderError('Slack returned an invalid authorization response');
    }

    const parsed = slackTokenResponseSchema.safeParse(payload);
    if (!parsed.success) {
        throw new SlackProviderError('Slack authorization was rejected');
    }

    return {
        accessToken: parsed.data.access_token,
        teamId: parsed.data.team.id,
        teamName: parsed.data.team.name ?? null,
    };
}